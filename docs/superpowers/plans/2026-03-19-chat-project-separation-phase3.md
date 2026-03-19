# Chat/Project Separation — Phase 3: Upgrade Trigger

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the Agent to suggest converting a Chat into a Project via the `[[PROJECT_UPGRADE]]` structured marker, display an inline `ProjectUpgradeCard` prompt to the user, and handle the full conversion flow (calling the existing `convert-to-project` API, updating the store, and showing a system message with the project link).

**Architecture:** The Agent outputs a `[[PROJECT_UPGRADE]]{json}[[/PROJECT_UPGRADE]]` marker in its response text. `ChatEngine` parses this marker (extending the existing Structured Marker Protocol) and emits a `project_upgrade_suggested` SSE event. `ChatView` receives this event, stores it via the existing `projectUpgradePanel` Zustand state (added in Phase 1), and renders a `ProjectUpgradeCard` component. When the user approves, the card POSTs to the existing `POST /api/conversations/:id/convert-to-project` endpoint, updates the store (adds project, marks conversation as converted), and shows a system message with a link to the new project.

**Tech Stack:** Next.js App Router, React, Zustand, TypeScript, SSE streaming

**Spec reference:** `docs/superpowers/specs/2026-03-19-chat-project-separation-design.md` — Section 二 (Chat → Project 转化流程) + Section 七 Phase 3

**Prerequisites:** Phase 1 (data layer, types, store state, convert API) and Phase 2 (ChatView `projectId` prop, project page embedding) are complete.

---

### Task 1: Add `project_upgrade` to Structured Marker Protocol in `chat-engine.ts`

**Files:**
- Modify: `lib/services/chat-engine.ts:111-114` — Extend `StructuredMarker['type']` union
- Modify: `lib/services/chat-engine.ts:122-127` — Add regex pattern to `parseStructuredMarkers`
- Modify: `lib/services/chat-engine.ts:147-156` — Add strip pattern to `stripMarkers`

**Why:** The `[[PROJECT_UPGRADE]]` marker must be parsed from the agent's text output just like the existing `[[TEAM_UPGRADE]]`, `[[PLAN_REVIEW]]` etc. markers.

- [ ] **Step 1: Extend StructuredMarker type union**

In `lib/services/chat-engine.ts`, change line 112:

From:
```typescript
  type: 'plan_mode_enter' | 'plan_review' | 'question_data' | 'team_upgrade';
```

To:
```typescript
  type: 'plan_mode_enter' | 'plan_review' | 'question_data' | 'team_upgrade' | 'project_upgrade';
```

- [ ] **Step 2: Add regex pattern to `parseStructuredMarkers`**

In `lib/services/chat-engine.ts`, after line 126 (the `TEAM_UPGRADE` pattern), add:

```typescript
    { regex: /\[\[PROJECT_UPGRADE\]\]([\s\S]*?)\[\[\/PROJECT_UPGRADE\]\]/g, type: 'project_upgrade' },
```

- [ ] **Step 3: Add strip pattern to `stripMarkers`**

In `lib/services/chat-engine.ts`, after line 152 (the `TEAM_UPGRADE` strip), add:

```typescript
    .replace(/\[\[PROJECT_UPGRADE\]\][\s\S]*?\[\[\/PROJECT_UPGRADE\]\]/g, '')
```

- [ ] **Step 4: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/services/chat-engine.ts
git commit -m "feat(chat-engine): add PROJECT_UPGRADE to structured marker protocol"
```

---

### Task 2: Emit `project_upgrade_suggested` SSE event from marker

**Files:**
- Modify: `lib/services/chat-engine.ts:555-564` — Add `project_upgrade` case in marker emission block

**Why:** When the agent outputs a `[[PROJECT_UPGRADE]]` marker, `handleUnified` must push a `project_upgrade_suggested` event onto the SSE channel so the frontend can display the upgrade prompt.

- [ ] **Step 1: Add project_upgrade marker emission**

In `lib/services/chat-engine.ts`, inside the `handleUnified` method's marker emission block (after line 563, the `team_upgrade` case), add:

```typescript
            } else if (marker.type === 'project_upgrade') {
              channel.push({ type: 'project_upgrade_suggested', data: marker.data });
            }
```

The full block should now read:

```typescript
          const markers = parseStructuredMarkers(responseText);
          for (const marker of markers) {
            if (marker.type === 'plan_review') {
              channel.push({ type: 'plan_review' as any, data: marker.data });
            } else if (marker.type === 'question_data') {
              channel.push({ type: 'questionnaire', data: marker.data });
            } else if (marker.type === 'plan_mode_enter') {
              channel.push({ type: 'plan_mode_enter' as any, data: marker.data });
            } else if (marker.type === 'team_upgrade') {
              channel.push({ type: 'team_upgrade', data: marker.data });
            } else if (marker.type === 'project_upgrade') {
              channel.push({ type: 'project_upgrade_suggested', data: marker.data });
            }
          }
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: No new errors. The `'project_upgrade_suggested'` type already exists in `ChatEventType` (added in Phase 1 at `lib/core/types.ts:425`).

- [ ] **Step 3: Commit**

```bash
git add lib/services/chat-engine.ts
git commit -m "feat(chat-engine): emit project_upgrade_suggested SSE event from marker"
```

---

### Task 3: Create `ProjectUpgradeCard` component

**Files:**
- Create: `components/chat/ProjectUpgradeCard.tsx`

**Why:** This is the inline card users see when the agent suggests converting a Chat to a Project. It mirrors the pattern of `CompactionUpgradeCard.tsx` but is simpler — no countdown timer, just two buttons (Convert to Project / Continue Chat). On approval it calls the existing `POST /api/conversations/:id/convert-to-project` endpoint.

- [ ] **Step 1: Create the component file**

Create `components/chat/ProjectUpgradeCard.tsx`:

```typescript
"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { usePulseStore } from "@/store/usePulseStore.new";
import type { Project } from "@/projects/types";

interface ProjectUpgradeCardProps {
  conversationId: string;
  onResolved: (converted: boolean) => void;
}

export function ProjectUpgradeCard({
  conversationId,
  onResolved,
}: ProjectUpgradeCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const resolvedRef = useRef(false);
  const [loading, setLoading] = useState(false);

  const addProject = usePulseStore((s) => s.addProject);
  const updateConversation = usePulseStore((s) => s.updateConversation);
  const addMessage = usePulseStore((s) => s.addMessage);

  const handleConvert = useCallback(async () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setLoading(true);

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/convert-to-project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[ProjectUpgradeCard] Convert failed:", err);
        resolvedRef.current = false;
        setLoading(false);
        return;
      }

      const data = await res.json();
      const { project_id, project_name, summary } = data;

      // Add project to store
      addProject({
        id: project_id,
        name: project_name,
        description: summary || "",
        status: "active",
        execution_mode: "foreman",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Project);

      // Update conversation in store
      updateConversation(conversationId, {
        status: "converted",
        project_id,
      });

      // Add system message with project link
      addMessage({
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "system",
        content: t("projectUpgrade.converted", {
          name: project_name,
          id: project_id,
        }),
        metadata: { type: "project_conversion", project_id },
        created_at: new Date().toISOString(),
      });

      onResolved(true);

      // Navigate to the new project
      router.push(`/projects/${project_id}`);
    } catch (err) {
      console.error("[ProjectUpgradeCard] Error:", err);
      resolvedRef.current = false;
      setLoading(false);
    }
  }, [conversationId, addProject, updateConversation, addMessage, onResolved, router, t]);

  const handleDismiss = useCallback(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolved(false);
  }, [onResolved]);

  return (
    <div className="mr-auto max-w-lg w-full">
      <div className="rounded-2xl bg-[var(--bg-glass)] border border-[var(--border-subtle)] overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FolderKanban className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t("projectUpgrade.title")}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {t("projectUpgrade.description")}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 pb-4 pt-2">
          <button
            onClick={handleConvert}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FolderKanban className="w-3.5 h-3.5" />
            )}
            {t("projectUpgrade.approve")}
          </button>
          <button
            onClick={handleDismiss}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-xl text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
          >
            {t("projectUpgrade.reject")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: No new errors (may show i18n key warnings until Task 4).

- [ ] **Step 3: Commit**

```bash
git add components/chat/ProjectUpgradeCard.tsx
git commit -m "feat: create ProjectUpgradeCard component for Chat→Project conversion"
```

---

### Task 4: Add i18n translation keys for ProjectUpgradeCard

**Files:**
- Modify: `lib/i18n/locales/en.ts` — Add `projectUpgrade.*` keys
- Modify: `lib/i18n/locales/zh.ts` — Add `projectUpgrade.*` keys

**Why:** The `ProjectUpgradeCard` uses five translation keys that don't exist yet.

- [ ] **Step 1: Add English translations**

In `lib/i18n/locales/en.ts`, add after the `compactionUpgrade.countdown` line (line 240):

```typescript
  'projectUpgrade.title': 'This looks like a project',
  'projectUpgrade.description': 'This task seems complex enough to benefit from a dedicated project workspace with persistent files and team collaboration.',
  'projectUpgrade.approve': 'Convert to Project',
  'projectUpgrade.reject': 'Continue chatting',
  'projectUpgrade.converted': 'Converted to project **{name}**. [Open project](/projects/{id})',
```

- [ ] **Step 2: Add Chinese translations**

In `lib/i18n/locales/zh.ts`, add after the `compactionUpgrade.countdown` line (line 240):

```typescript
  'projectUpgrade.title': '这看起来是一个项目',
  'projectUpgrade.description': '这个任务比较复杂，建议转为项目处理，产出物将常驻工作空间，支持团队协作。',
  'projectUpgrade.approve': '转为项目',
  'projectUpgrade.reject': '继续聊天',
  'projectUpgrade.converted': '已转为项目 **{name}**。[打开项目](/projects/{id})',
```

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/locales/en.ts lib/i18n/locales/zh.ts
git commit -m "feat(i18n): add projectUpgrade translation keys (en + zh)"
```

---

### Task 5: Wire `project_upgrade_suggested` SSE event in ChatView

**Files:**
- Modify: `components/chat/ChatView.tsx:17` — Add `ProjectUpgradeCard` import
- Modify: `components/chat/ChatView.tsx:98-102` — Bind `projectUpgradePanel` store selectors
- Modify: `components/chat/ChatView.tsx:595-606` — Add SSE event handler case
- Modify: `components/chat/ChatView.tsx:681` — Add `showProjectUpgrade` to `handleSSEEvent` dependency array

**Why:** ChatView needs to receive the `project_upgrade_suggested` SSE event, store it in `projectUpgradePanel` state, and render `ProjectUpgradeCard` when visible.

- [ ] **Step 1: Add `ProjectUpgradeCard` import**

In `components/chat/ChatView.tsx`, after line 16 (`import { CompactionUpgradeCard }`), add:

```typescript
import { ProjectUpgradeCard } from "./ProjectUpgradeCard";
```

- [ ] **Step 2: Bind `projectUpgradePanel` store selectors**

In `components/chat/ChatView.tsx`, after line 102 (`const clearPendingTeamUpgrade = ...`), add:

```typescript
  const projectUpgradePanel = usePulseStore((s) => s.projectUpgradePanel);
  const showProjectUpgrade = usePulseStore((s) => s.showProjectUpgrade);
  const hideProjectUpgrade = usePulseStore((s) => s.hideProjectUpgrade);
```

- [ ] **Step 3: Add `project_upgrade_suggested` case in `handleSSEEvent`**

In `components/chat/ChatView.tsx`, inside the `handleSSEEvent` switch, after the `team_upgrade` case (after line 614), add:

```typescript
        case "project_upgrade_suggested": {
          showProjectUpgrade(conversationId);
          break;
        }
```

- [ ] **Step 4: Add `showProjectUpgrade` to `handleSSEEvent` dependency array**

In `components/chat/ChatView.tsx`, update the dependency array at line 681. Change:

```typescript
    [addMessage, showToolApproval, hideToolApproval, addAgentLog, addStreamingStep, completeStreamingStep, setTeamCollaborationActive, setQuestionnaireData, showCompactionUpgrade, hideCompactionUpgrade, setPendingTeamUpgrade, addProject, setRunning, handleToken, startStreamingToolCall, endStreamingToolCall, resetStreamingState, setContextUsage, t]
```

To:

```typescript
    [addMessage, showToolApproval, hideToolApproval, addAgentLog, addStreamingStep, completeStreamingStep, setTeamCollaborationActive, setQuestionnaireData, showCompactionUpgrade, hideCompactionUpgrade, setPendingTeamUpgrade, addProject, setRunning, handleToken, startStreamingToolCall, endStreamingToolCall, resetStreamingState, setContextUsage, showProjectUpgrade, t]
```

(Added `showProjectUpgrade` before `t`)

- [ ] **Step 5: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add components/chat/ChatView.tsx
git commit -m "feat(ChatView): handle project_upgrade_suggested SSE event"
```

---

### Task 6: Render `ProjectUpgradeCard` in ChatView JSX

**Files:**
- Modify: `components/chat/ChatView.tsx:759-760` — Add `ProjectUpgradeCard` rendering after `CompactionUpgradeCard`

**Why:** The card must be rendered inline in the message stream, following the same pattern as `CompactionUpgradeCard`.

- [ ] **Step 1: Add ProjectUpgradeCard rendering**

In `components/chat/ChatView.tsx`, after line 759 (the closing of the `CompactionUpgradeCard` block, before the questionnaire block), add:

```tsx
                    {projectUpgradePanel.visible && projectUpgradePanel.conversationId && activeConversationId && !projectId && (
                      <ProjectUpgradeCard
                        conversationId={activeConversationId}
                        onResolved={() => {
                          hideProjectUpgrade();
                        }}
                      />
                    )}
```

Note the `!projectId` guard: if the user is already in a project-embedded ChatView, we don't show the upgrade card (the conversation is already linked to a project).

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/ChatView.tsx
git commit -m "feat(ChatView): render ProjectUpgradeCard inline after CompactionUpgradeCard"
```

---

### Task 7: Verify end-to-end flow

This task is manual verification and cannot be automated. It ensures all Phase 3 components work together.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: No build errors. Server starts successfully.

- [ ] **Step 2: Test marker parsing (backend)**

To test without waiting for the agent to naturally suggest an upgrade, temporarily add a test in the chat-engine or use the browser console to simulate the SSE event. Verify that if the agent's response contains:

```
[[PROJECT_UPGRADE]]{"reason":"This task is complex"}[[/PROJECT_UPGRADE]]
```

The `parseStructuredMarkers` function returns `[{ type: 'project_upgrade', data: { reason: 'This task is complex' } }]`.

- [ ] **Step 3: Test SSE event flow (frontend)**

Verify the `ProjectUpgradeCard` appears when the `project_upgrade_suggested` event is received. In a real scenario:
- Start a new chat at `/`
- Send a message that describes a complex multi-step task
- If the agent outputs the `[[PROJECT_UPGRADE]]` marker, the card should appear
- The card should show "This looks like a project" with two buttons

- [ ] **Step 4: Test the conversion flow**

Click "Convert to Project":
- A loading spinner should appear on the button
- The API should create a project and return success
- A system message should appear: "Converted to project **{name}**. [Open project](/projects/{id})"
- The user should be navigated to `/projects/{id}`
- The conversation should be marked as `converted` in the store

- [ ] **Step 5: Test the dismiss flow**

Click "Continue chatting":
- The card should disappear
- No API call is made
- The chat continues normally

- [ ] **Step 6: Test that card doesn't show in project mode**

Navigate to `/projects/{id}` and verify that even if `projectUpgradePanel.visible` is true, the card is not rendered (because `!projectId` is false).

- [ ] **Step 7: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: address Phase 3 verification findings"
```

---

## Summary of Phase 3 Deliverables

| Deliverable | Task |
|-------------|------|
| `[[PROJECT_UPGRADE]]` marker parsing in Structured Marker Protocol | Task 1 |
| `project_upgrade_suggested` SSE event emission | Task 2 |
| `ProjectUpgradeCard` component | Task 3 |
| i18n translations (en + zh) | Task 4 |
| SSE event wiring in ChatView | Task 5 |
| Inline rendering in ChatView JSX | Task 6 |
| End-to-end verification | Task 7 |

## Dependencies from Earlier Phases (already complete)

| Dependency | Where | Phase |
|---|---|---|
| `project_upgrade_suggested` in `ChatEventType` | `lib/core/types.ts:425` | Phase 1 Task 4 |
| `projectUpgradePanel` Zustand state + actions | `store/slices/chatSlice.ts:129-133, 225-226, 343-346, 777-780` | Phase 1 Task 5 |
| `POST /api/conversations/:id/convert-to-project` endpoint | `app/api/conversations/[id]/convert-to-project/route.ts` | Phase 1 Task 6 |
| `ChatView.projectId` prop | `components/chat/ChatView.tsx:52-57` | Phase 2 Task 1 |

## Tech Debt Notes

- **Agent prompt integration:** This plan does not modify the agent's system prompt to teach it when to output `[[PROJECT_UPGRADE]]` markers. That's a prompt-engineering concern handled separately in the agent configuration. The marker protocol is ready for agents to use.
- **No visual animation:** The `ProjectUpgradeCard` appears/disappears instantly. A future enhancement could add a slide-in animation.
- **Single conversion per chat:** The card only appears once. If dismissed, the agent could theoretically output the marker again in a subsequent response and the card would reappear. This is acceptable behavior.

**Next Phase (Phase 4):** Sidebar changes — filter converted conversations, add Projects section.
