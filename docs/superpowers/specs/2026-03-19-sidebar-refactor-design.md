# Sidebar Refactor Design

**Date:** 2026-03-19
**Status:** Approved

## Overview

Refactor the sidebar conversation list from time-based grouping (Today/Yesterday/Earlier) to a two-section layout: **Highlights** (user-pinned conversations) and **Recents** (top 5 by last interaction). Full conversation history remains accessible via a search modal overlay.

## 1. Data Model

### Database

Add `highlighted` column to `conversations` table:

```sql
ALTER TABLE conversations ADD COLUMN highlighted boolean NOT NULL DEFAULT false;
```

### TypeScript Type

Add to `Conversation` interface in `lib/core/types.ts`:

```typescript
highlighted: boolean;
```

## 2. API

No new endpoints needed. The existing `PATCH /api/conversations/[id]` already supports arbitrary field updates:

```json
{ "highlighted": true }
```

The existing `GET /api/conversations` already returns all fields including the new `highlighted` column.

## 3. Store Changes

In `store/slices/chatSlice.ts`, add one action:

```typescript
toggleHighlight: (conversationId: string) => void
```

Behavior:
- Flip the `highlighted` field on the local conversation object
- Fire `PATCH /api/conversations/[id]` with `{ highlighted: !current }` to persist

No new state slices needed; the existing `conversations` array already carries the field.

## 4. Sidebar UI (Expanded State)

Layout top-to-bottom:

1. **Logo bar** — RebuilD logo + collapse button (unchanged)
2. **New Chat button** — unchanged
3. **Search button** — a clickable row (not an inline input), opens the search modal
4. **Highlights section**
   - Section header: "Highlights" (label style matching current group headers)
   - List of conversations where `highlighted === true`, sorted by `updated_at DESC`
   - No quantity cap
   - Each item: title (truncated) + hover `...` menu
   - If no highlighted conversations, section is hidden entirely
5. **Recents section**
   - Section header: "Recents"
   - Top 5 conversations where `highlighted === false`, sorted by `updated_at DESC`
   - Each item: title (truncated) + hover `...` menu
6. **Bottom nav** — Graph + Settings buttons (unchanged)

## 5. Context Menu

The `...` hover menu on each conversation item contains:

| In Recents | In Highlights |
|---|---|
| Highlight | Unhighlight |
| Rename | Rename |
| Delete | Delete |

- **Highlight** — sets `highlighted: true`, conversation moves from Recents to Highlights
- **Unhighlight** — sets `highlighted: false`, conversation moves from Highlights back to Recents (if it qualifies for top 5)
- **Rename / Delete** — unchanged from current behavior

## 6. Search Modal

Triggered by clicking the search button in the sidebar. Renders as a modal overlay on the main content area (not inside the sidebar).

**Layout:**
- Top: search input with placeholder "Search chats..." + close (X) button
- Below input: "New Chat" action row
- Below that: full conversation list grouped by time (Today / Yesterday / Earlier) — reuses existing `groupConversationsByTime` logic
- Real-time filtering as user types
- Clicking a conversation closes the modal and navigates to that chat
- Clicking X or pressing Escape closes the modal

**Styling:** Semi-transparent backdrop, centered panel with rounded corners, similar to the reference screenshot.

## 7. Sidebar Collapsed State

The collapsed state (52px width) shows icon-only buttons:

- Logo button (expand)
- New Chat (+) button
- Bottom nav: Graph + Settings icons

No conversation list or avatars in collapsed state.

## 8. i18n

Add keys to `lib/i18n/locales/en.ts` and `zh.ts`:

| Key | EN | ZH |
|---|---|---|
| `sidebar.highlights` | Highlights | High Light |
| `sidebar.recents` | Recents | Recent |
| `sidebar.search` | Search chats... | Search Chat... |
| `common.highlight` | Highlight | High Light |
| `common.unhighlight` | Unhighlight | Cancel High Light |

## 9. Files to Modify

| File | Change |
|---|---|
| `database/schema.sql` | Add `highlighted` column |
| New migration file | `ALTER TABLE` for existing deployments |
| `lib/core/types.ts` | Add `highlighted: boolean` to Conversation |
| `store/slices/chatSlice.ts` | Add `toggleHighlight` action |
| `components/layout/Sidebar.tsx` | Replace time-grouped list with Highlights + Recents sections; add search button; update collapsed state |
| `components/layout/SearchModal.tsx` | New component: search overlay with full conversation list |
| `lib/i18n/locales/en.ts` | Add new keys |
| `lib/i18n/locales/zh.ts` | Add new keys |
