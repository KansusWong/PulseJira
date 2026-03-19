# Sidebar Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace time-based conversation grouping with Highlights + Recents sections, add search modal for full history access, and simplify collapsed sidebar.

**Architecture:** Add `highlighted` boolean to the conversations table and TypeScript type. Sidebar renders two sections (highlighted conversations, then top-5 non-highlighted by `updated_at`). A new SearchModal component provides full conversation history with time-based grouping and real-time filtering. Context menu gains Highlight/Unhighlight toggle.

**Tech Stack:** Next.js, React, Zustand, PostgreSQL, Tailwind CSS, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-03-19-sidebar-refactor-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `database/schema.sql` | Modify | Add `highlighted` column to conversations table definition |
| `database/migrations/046_add_conversation_highlighted.sql` | Create | ALTER TABLE migration for existing deployments |
| `lib/core/types.ts` | Modify | Add `highlighted: boolean` to Conversation interface |
| `store/slices/chatSlice.ts` | Modify | Add `toggleHighlight` action |
| `lib/i18n/locales/en.ts` | Modify | Add i18n keys for highlights, recents, highlight/unhighlight |
| `lib/i18n/locales/zh.ts` | Modify | Add i18n keys (Chinese) |
| `components/layout/Sidebar.tsx` | Modify | Replace time-grouped list with Highlights + Recents; simplify collapsed state; add search button |
| `components/layout/SearchModal.tsx` | Create | Modal overlay with full conversation list, time grouping, real-time search |

---

### Task 1: Database — Add `highlighted` column

**Files:**
- Modify: `database/schema.sql:141-150`
- Create: `database/migrations/046_add_conversation_highlighted.sql`

- [ ] **Step 1: Add column to schema baseline**

In `database/schema.sql`, add `highlighted` to the conversations table definition (after `execution_mode` line):

```sql
  highlighted boolean not null default false,
```

- [ ] **Step 2: Create migration file**

Create `database/migrations/046_add_conversation_highlighted.sql`:

```sql
-- Add highlighted flag for sidebar pinning
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS highlighted boolean NOT NULL DEFAULT false;
```

- [ ] **Step 3: Commit**

```bash
git add database/schema.sql database/migrations/046_add_conversation_highlighted.sql
git commit -m "feat(db): add highlighted column to conversations table"
```

---

### Task 2: TypeScript type + Store action

**Files:**
- Modify: `lib/core/types.ts:306-326`
- Modify: `store/slices/chatSlice.ts:160-165` (interface) and `~436` (implementation)

- [ ] **Step 1: Add `highlighted` field to Conversation interface**

In `lib/core/types.ts`, add after line 325 (`updated_at: string;`):

```typescript
  highlighted: boolean;
```

- [ ] **Step 2: Add `toggleHighlight` action to ChatSlice interface**

In `store/slices/chatSlice.ts`, add after `updateConversation` (line 165):

```typescript
  toggleHighlight: (conversationId: string) => void;
```

- [ ] **Step 3: Implement `toggleHighlight` action**

In `store/slices/chatSlice.ts`, add after the `updateConversation` implementation (~line 441):

```typescript
  toggleHighlight: (conversationId) =>
    set((state) => {
      const conv = state.conversations.find((c) => c.id === conversationId);
      if (!conv) return state;
      const next = !conv.highlighted;
      // Persist to backend (fire-and-forget)
      fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlighted: next }),
      }).catch(() => {});
      return {
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, highlighted: next } : c
        ),
      };
    }),
```

- [ ] **Step 4: Verify build compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/core/types.ts store/slices/chatSlice.ts
git commit -m "feat(store): add highlighted field and toggleHighlight action"
```

---

### Task 3: i18n keys

**Files:**
- Modify: `lib/i18n/locales/en.ts:66-68` (sidebar section)
- Modify: `lib/i18n/locales/zh.ts:66-68` (sidebar section)

- [ ] **Step 1: Add English keys**

In `lib/i18n/locales/en.ts`, add after `'sidebar.searchChats'` (line 66):

```typescript
  'sidebar.highlights': 'Highlights',
  'sidebar.recents': 'Recents',
  'common.highlight': 'Highlight',
  'common.unhighlight': 'Unhighlight',
```

- [ ] **Step 2: Add Chinese keys**

In `lib/i18n/locales/zh.ts`, add at the matching location:

```typescript
  'sidebar.highlights': 'High Light',
  'sidebar.recents': 'Recent',
  'common.highlight': 'High Light',
  'common.unhighlight': '取消 High Light',
```

- [ ] **Step 3: Commit**

```bash
git add lib/i18n/locales/en.ts lib/i18n/locales/zh.ts
git commit -m "feat(i18n): add highlight and recents sidebar keys"
```

---

### Task 4: SearchModal component

**Files:**
- Create: `components/layout/SearchModal.tsx`

This component is the modal overlay triggered from the sidebar search button. It shows full conversation history with time grouping and real-time filtering.

- [ ] **Step 1: Create SearchModal component**

Create `components/layout/SearchModal.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, Search, SquarePen } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface SearchModalProps {
  conversations: Array<{ id: string; title: string | null; updated_at: string; status: string }>;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

function groupByTime(
  conversations: SearchModalProps["conversations"],
  t: (key: string) => string
) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  const today: typeof conversations = [];
  const yesterday: typeof conversations = [];
  const earlier: typeof conversations = [];

  for (const conv of conversations) {
    const d = new Date(conv.updated_at);
    if (d >= todayStart) today.push(conv);
    else if (d >= yesterdayStart) yesterday.push(conv);
    else earlier.push(conv);
  }

  const groups: { label: string; items: typeof conversations }[] = [];
  if (today.length) groups.push({ label: t("time.today"), items: today });
  if (yesterday.length) groups.push({ label: t("time.yesterday"), items: yesterday });
  if (earlier.length) groups.push({ label: t("time.earlier"), items: earlier });
  return groups;
}

export function SearchModal({ conversations, onSelectConversation, onNewChat, onClose }: SearchModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title && c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupByTime(filtered, t), [filtered, t]);

  const handleSelect = (id: string) => {
    onSelectConversation(id);
    onClose();
  };

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-[560px] max-h-[70vh] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-subtle)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("sidebar.searchChats")}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* New Chat action */}
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          >
            <SquarePen className="w-4 h-4 text-[var(--text-secondary)]" />
            {t("sidebar.newChat")}
          </button>

          {/* Grouped conversations */}
          {groups.map((group) => (
            <div key={group.label} className="mt-2">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-medium select-none">
                {group.label}
              </div>
              {group.items.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelect(conv.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                >
                  <div className="w-5 h-5 rounded-full border border-[var(--border-subtle)] flex-shrink-0" />
                  <span className="truncate">{conv.title || t("sidebar.newConversation")}</span>
                </button>
              ))}
            </div>
          ))}

          {/* No results */}
          {groups.length === 0 && query && (
            <div className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">
              {t("sidebar.noMatches")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/layout/SearchModal.tsx
git commit -m "feat(ui): add SearchModal component for full conversation history"
```

---

### Task 5: Sidebar refactor — expanded state

**Files:**
- Modify: `components/layout/Sidebar.tsx`

This is the main task. Replace the time-grouped conversation list with Highlights + Recents sections, replace inline search with a search button that opens SearchModal, and update the context menu.

- [ ] **Step 1: Add imports**

At the top of `Sidebar.tsx`, add the new imports:

```typescript
import { Sparkles, Search as SearchIcon } from "lucide-react";
import { SearchModal } from "./SearchModal";
```

Add `Sparkles` to use as the Highlight icon in context menu. `SearchIcon` aliased to avoid collision if needed.

Note: Remove the existing `Search` import from the lucide-react import line (it's currently used for the inline search bar which is being removed from the default view).

- [ ] **Step 2: Add searchModalOpen state and toggleHighlight store selector**

Inside the `Sidebar` component, add:

```typescript
const [searchModalOpen, setSearchModalOpen] = useState(false);
const toggleHighlight = usePulseStore((s) => s.toggleHighlight);
```

- [ ] **Step 3: Remove inline search bar and time grouping from expanded view**

Remove the `searchQuery` state, the `filteredConversations` useMemo, and the `groups` useMemo that calls `groupConversationsByTime`. These are no longer needed in the default sidebar view.

Also remove the search input `<div className="px-3 pb-2">...</div>` block.

Note: Keep the `groupConversationsByTime` function definition at the top of the file — it will be used by SearchModal (passed as conversations prop, the grouping happens inside SearchModal itself). Actually, SearchModal has its own `groupByTime` — so `groupConversationsByTime` can be removed entirely from Sidebar.tsx.

- [ ] **Step 4: Compute highlights and recents lists**

Add two `useMemo` hooks replacing the old `groups`:

```typescript
const highlightedConversations = useMemo(
  () => conversations.filter((c) => c.highlighted).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  ),
  [conversations]
);

const recentConversations = useMemo(
  () => conversations
    .filter((c) => !c.highlighted)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5),
  [conversations]
);
```

- [ ] **Step 5: Update context menu to support Highlight / Unhighlight**

Modify `ConversationContextMenu` to accept a new prop:

```typescript
interface ConversationContextMenuProps {
  conversationId: string;
  isHighlighted: boolean;
  onToggleHighlight: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}
```

Add a Highlight/Unhighlight button as the first menu item:

```tsx
<button
  onClick={() => {
    onToggleHighlight(conversationId);
    onClose();
  }}
  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
>
  <Sparkles className="w-3 h-3" />
  {isHighlighted ? t("common.unhighlight") : t("common.highlight")}
</button>
```

- [ ] **Step 6: Replace conversation list in expanded view**

Replace the entire `{/* Conversation list with time groups */}` section with:

```tsx
{/* Search button */}
<div className="px-3 pb-2">
  <button
    onClick={() => setSearchModalOpen(true)}
    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] rounded-lg transition-colors"
  >
    <SearchIcon className="w-3.5 h-3.5" />
    {t("sidebar.searchChats")}
  </button>
</div>

{/* Conversation sections */}
<div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
  {/* Highlights */}
  {highlightedConversations.length > 0 && (
    <div className="mb-2">
      <div className="px-2 pt-3 pb-1 text-[9px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-medium select-none">
        {t("sidebar.highlights")}
      </div>
      <div className="space-y-0.5">
        {highlightedConversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            isActive={activeConversationId === conv.id}
            isRenaming={renamingId === conv.id}
            renameValue={renameValue}
            onSelect={handleSelectConversation}
            onRenameValueChange={setRenameValue}
            onCommitRename={handleCommitRename}
            onRenameKeyDown={handleRenameKeyDown}
            renameInputRef={renamingId === conv.id ? renameInputRef : undefined}
            contextMenuId={contextMenuId}
            onContextMenu={setContextMenuId}
            contextMenuAnchorRef={contextMenuAnchorRef}
            onStartRename={handleStartRename}
            onDelete={(id) => onDeleteConversation?.(id)}
            onToggleHighlight={toggleHighlight}
            t={t}
          />
        ))}
      </div>
    </div>
  )}

  {/* Recents */}
  {recentConversations.length > 0 && (
    <div className="mb-2">
      <div className="px-2 pt-3 pb-1 text-[9px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-medium select-none">
        {t("sidebar.recents")}
      </div>
      <div className="space-y-0.5">
        {recentConversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            isActive={activeConversationId === conv.id}
            isRenaming={renamingId === conv.id}
            renameValue={renameValue}
            onSelect={handleSelectConversation}
            onRenameValueChange={setRenameValue}
            onCommitRename={handleCommitRename}
            onRenameKeyDown={handleRenameKeyDown}
            renameInputRef={renamingId === conv.id ? renameInputRef : undefined}
            contextMenuId={contextMenuId}
            onContextMenu={setContextMenuId}
            contextMenuAnchorRef={contextMenuAnchorRef}
            onStartRename={handleStartRename}
            onDelete={(id) => onDeleteConversation?.(id)}
            onToggleHighlight={toggleHighlight}
            t={t}
          />
        ))}
      </div>
    </div>
  )}

  {highlightedConversations.length === 0 && recentConversations.length === 0 && (
    <div className="px-3 py-6 text-center">
      <p className="text-xs text-[var(--text-muted)]">{t("sidebar.newConversation")}</p>
    </div>
  )}
</div>
```

Note: Extract the per-conversation row into a `ConversationItem` helper to avoid duplicating the render logic between Highlights and Recents. This component includes the context menu with the `isHighlighted` prop derived from `conv.highlighted`.

- [ ] **Step 7: Add SearchModal render**

At the end of the expanded-state return, before the closing `</div>`, add:

```tsx
{searchModalOpen && (
  <SearchModal
    conversations={conversations}
    onSelectConversation={handleSelectConversation}
    onNewChat={handleNewChat}
    onClose={() => setSearchModalOpen(false)}
  />
)}
```

- [ ] **Step 8: Verify build compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(sidebar): replace time groups with Highlights + Recents sections"
```

---

### Task 6: Sidebar refactor — collapsed state

**Files:**
- Modify: `components/layout/Sidebar.tsx`

Simplify the collapsed sidebar to only show Logo, New Chat, and bottom nav — no conversation avatars.

- [ ] **Step 1: Remove conversation avatars from collapsed view**

In the collapsed state return block (`if (!expanded)`), remove the entire `{/* Conversation first-letter avatars */}` section (the `<div className="flex-1 overflow-y-auto ...">` containing the `.slice(0, 30).map(...)` loop).

Replace it with a spacer:

```tsx
<div className="flex-1" />
```

- [ ] **Step 2: Verify build compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(sidebar): simplify collapsed state — remove conversation avatars"
```

---

### Task 7: Cleanup — remove dead code

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Remove unused functions and imports**

Remove from Sidebar.tsx:
- `groupConversationsByTime` function (no longer called)
- `ConversationGroup` interface (no longer used)
- `relativeTime` function (no longer displayed — items show title only, no relative time)
- Any unused imports that were only needed by removed code

- [ ] **Step 2: Verify build compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with no warnings about unused code.

- [ ] **Step 3: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "refactor(sidebar): remove dead code from time-based grouping"
```
