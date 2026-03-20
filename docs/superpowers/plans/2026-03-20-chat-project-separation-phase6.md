# Phase 6: Seamless Foreman → Team Transition UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable seamless, progressive transition from Foreman mode (single-agent chat) to Team mode (multi-agent collaboration) in project workspaces, with animated reveal and state persistence after streaming ends.

**Architecture:** ChatView's `handleSSEEvent` gains handlers for `team_update` and `sub_agent_start` that activate team collaboration mode. The layout transitions from standard chat to team view with CSS `transition-all` animations instead of the current binary snap. In project mode, team state persists after streaming completes so users can review agent work. The project's `execution_mode` is updated from `foreman` to `team` when team activates.

**Tech Stack:** React 18, TypeScript, Zustand (usePulseStore), Next.js App Router, Tailwind CSS transitions

**Spec reference:** `docs/superpowers/specs/2026-03-19-chat-project-separation-design.md` — Section 三 (项目内交互模型) + Section 七 Phase 6

**Prerequisites:** Phases 1–5 are complete. `team_update` exists in `ChatEventType` union (types.ts:410). `showTeamPanel`, `updateTeamStatus`, `setTeamCollaborationActive` actions exist in `chatSlice.ts`. All team UI components (`TeamCollaborationView`, `TeamStatusBar`, `AgentLane`, `AgentLaneGrid`) are built.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `components/chat/ChatView.tsx:500-732` | Add `team_update` SSE handler, activate team on `sub_agent_start`, project-mode persistence |
| Modify | `components/chat/ChatView.tsx:734-845` | Progressive reveal layout with CSS transitions |
| Modify | `lib/i18n/locales/en.ts:327` | Add `team.collaboration.activated` i18n key |
| Modify | `lib/i18n/locales/zh.ts:327` | Add `team.collaboration.activated` i18n key (Chinese) |

---

### Task 1: Add `team_update` SSE event handler in ChatView

**Files:**
- Modify: `components/chat/ChatView.tsx:59-97` — Add store action imports
- Modify: `components/chat/ChatView.tsx:500-732` — Add `team_update` and `team_comms` cases to `handleSSEEvent`

**Why:** The `team_update` SSE event carries team status (teamId + agents list) from the server, but ChatView currently has no handler for it. Without this, the team panel is never populated, and team mode never activates.

- [ ] **Step 1: Add store action imports for team panel**

In `components/chat/ChatView.tsx`, add these store selectors after the existing `teamId` selector (around line 96):

```typescript
const showTeamPanel = usePulseStore((s) => s.showTeamPanel);
const updateTeamStatus = usePulseStore((s) => s.updateTeamStatus);
const addTeamCommunication = usePulseStore((s) => s.addTeamCommunication);
const updateProjectInStore = usePulseStore((s) => s.updateProjectInStore);
```

- [ ] **Step 2: Add `team_update` case to handleSSEEvent**

In the `handleSSEEvent` switch statement (after the `sub_agent_complete` case at line 628), add:

```typescript
case "team_update": {
  const status = event.data as TeamStatus;
  const currentTeamPanel = usePulseStore.getState().teamPanel;
  if (!currentTeamPanel.teamId) {
    // First team_update — initialize the team panel
    showTeamPanel(status.team_id, status.agents);
  } else {
    // Subsequent updates — refresh agent statuses
    updateTeamStatus(status);
  }
  // Activate team collaboration view
  setTeamCollaborationActive(true);
  // Update project execution_mode to 'team' (fire-and-forget)
  if (projectId) {
    updateProjectInStore(projectId, { execution_mode: 'team' });
    fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ execution_mode: 'team' }),
    }).catch(() => {});
  }
  break;
}

case "team_comms": {
  if (event.data) {
    addTeamCommunication(event.data);
  }
  break;
}
```

- [ ] **Step 3: Activate team collaboration on `sub_agent_start` as a fallback**

Modify the existing `sub_agent_start` case (lines 593-604). After the `addStreamingStep` call, add team activation logic:

From:
```typescript
case "sub_agent_start": {
  const agentName = event.data.agent_name || "sub-agent";
  const task = event.data.task || "";
  addStreamingStep({
    id: `sub-start-${agentName}-${Date.now()}`,
    agent: agentName,
    kind: "thinking",
    message: task ? `${t('streaming.subAgentStart')}: ${task}` : `${t('streaming.subAgentStarting', { name: agentName })}`,
    timestamp: Date.now(),
  });
  break;
}
```

To:
```typescript
case "sub_agent_start": {
  const agentName = event.data.agent_name || "sub-agent";
  const task = event.data.task || "";
  addStreamingStep({
    id: `sub-start-${agentName}-${Date.now()}`,
    agent: agentName,
    kind: "thinking",
    message: task ? `${t('streaming.subAgentStart')}: ${task}` : `${t('streaming.subAgentStarting', { name: agentName })}`,
    timestamp: Date.now(),
  });
  // Activate team collaboration if not already active
  if (!usePulseStore.getState().teamCollaboration.active) {
    setTeamCollaborationActive(true);
  }
  break;
}
```

- [ ] **Step 4: Add `showTeamPanel`, `updateTeamStatus`, `addTeamCommunication`, `updateProjectInStore` to the handleSSEEvent dependency array**

Update the dependency array at line 731:

From:
```typescript
[addMessage, showToolApproval, hideToolApproval, addAgentLog, addStreamingStep, completeStreamingStep, setTeamCollaborationActive, setQuestionnaireData, showCompactionUpgrade, hideCompactionUpgrade, setPendingTeamUpgrade, addProject, setRunning, handleToken, startStreamingToolCall, endStreamingToolCall, resetStreamingState, setContextUsage, showProjectUpgrade, t]
```

To:
```typescript
[addMessage, showToolApproval, hideToolApproval, addAgentLog, addStreamingStep, completeStreamingStep, setTeamCollaborationActive, setQuestionnaireData, showCompactionUpgrade, hideCompactionUpgrade, setPendingTeamUpgrade, addProject, setRunning, handleToken, startStreamingToolCall, endStreamingToolCall, resetStreamingState, setContextUsage, showProjectUpgrade, showTeamPanel, updateTeamStatus, addTeamCommunication, updateProjectInStore, projectId, t]
```

- [ ] **Step 5: Add `TeamStatus` to the import**

At line 11, add `TeamStatus` to the type import:

From:
```typescript
import type { ChatMessage, ChatEvent, StructuredAgentStep, AttachmentMeta } from "@/lib/core/types";
```

To:
```typescript
import type { ChatMessage, ChatEvent, StructuredAgentStep, AttachmentMeta, TeamStatus } from "@/lib/core/types";
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to ChatView.tsx

- [ ] **Step 7: Commit**

```bash
git add components/chat/ChatView.tsx
git commit -m "feat(ChatView): add team_update SSE handler and sub_agent_start team activation"
```

---

### Task 2: Project-mode team persistence (don't reset after streaming)

**Files:**
- Modify: `components/chat/ChatView.tsx:480-494` — Conditional reset in `finally` block
- Modify: `components/chat/ChatView.tsx:713-716` — Conditional reset on `done` event
- Modify: `components/chat/ChatView.tsx:269-274` — Conditional reset in `handleStop`

**Why:** Currently the `finally` block always calls `setTeamCollaborationActive(false)` and `clearAllMateState()`, which removes the team view the moment streaming ends. In project mode, the team's work results should remain visible so the user can review what agents did.

- [ ] **Step 1: Make `finally` block conditional on project mode**

In the `finally` block (lines 480-494), replace the unconditional resets:

From:
```typescript
      } finally {
        clearTimeout(streamTimeout);
        abortRef.current = null;
        setStreaming(false);
        clearStreamingSteps();
        resetStreamingState();
        setTeamCollaborationActive(false);
        clearAllMateState();
        // Flush any remaining token buffer
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = undefined;
        }
        tokenBufferRef.current = '';
      }
```

To:
```typescript
      } finally {
        clearTimeout(streamTimeout);
        abortRef.current = null;
        setStreaming(false);
        clearStreamingSteps();
        resetStreamingState();
        // In project mode, preserve team state so users can review agent work
        const hadTeam = usePulseStore.getState().teamCollaboration.active;
        if (!projectId || !hadTeam) {
          setTeamCollaborationActive(false);
          clearAllMateState();
        }
        // Flush any remaining token buffer
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = undefined;
        }
        tokenBufferRef.current = '';
      }
```

- [ ] **Step 2: Make `done` event conditional**

In the `done` case handler (lines 713-716):

From:
```typescript
case "done": {
  setTeamCollaborationActive(false);
  break;
}
```

To:
```typescript
case "done": {
  // In project mode with active team, keep team visible for review
  if (!projectId || !usePulseStore.getState().teamCollaboration.active) {
    setTeamCollaborationActive(false);
  }
  break;
}
```

- [ ] **Step 3: Make `handleStop` conditional**

In `handleStop` (around line 273):

From:
```typescript
    setTeamCollaborationActive(false);
```

To:
```typescript
    // In project mode with active team, keep team visible for review
    const hadTeam = usePulseStore.getState().teamCollaboration.active;
    if (!projectId || !hadTeam) {
      setTeamCollaborationActive(false);
    }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add components/chat/ChatView.tsx
git commit -m "feat(ChatView): preserve team state after streaming in project mode"
```

---

### Task 3: Progressive reveal layout with CSS transitions

**Files:**
- Modify: `components/chat/ChatView.tsx:734-845` — Replace binary snap with animated layout transition

**Why:** Currently the team view snaps on/off instantly via the `teamFullscreen` boolean. The spec calls for a progressive, animated reveal — TeamStatusBar slides in, messages area shrinks smoothly, and AgentLaneGrid expands gradually.

- [ ] **Step 1: Update the `teamFullscreen` logic to support non-streaming team view**

At line 734:

From:
```typescript
const teamFullscreen = teamCollaborationActive && isStreaming;
```

To:
```typescript
// Team view is visible when collaboration is active (during streaming or persisted in project mode)
const teamVisible = teamCollaborationActive && (isStreaming || (!!projectId && teamAgents.length > 0));
```

- [ ] **Step 2: Replace the messages area class with transition-based layout**

At line 763, replace the messages container:

From:
```typescript
<div ref={scrollContainerRef} className={`${teamFullscreen ? 'flex-shrink-0 max-h-[15vh]' : 'flex-1'} overflow-y-auto`}>
```

To:
```typescript
<div ref={scrollContainerRef} className={`overflow-y-auto transition-all duration-300 ease-in-out ${teamVisible ? 'flex-shrink-0 max-h-[15vh]' : 'flex-1'}`}>
```

- [ ] **Step 3: Replace the inline streaming bubble visibility check**

At line 784, replace `teamFullscreen` references with `teamVisible`:

From:
```typescript
{!teamFullscreen && (
  <div className="max-w-[680px] mx-auto px-4 pb-6 space-y-4">
```

To:
```typescript
{!teamVisible && (
  <div className="max-w-[680px] mx-auto px-4 pb-6 space-y-4">
```

- [ ] **Step 4: Replace the team collaboration container with animated version**

At lines 835-839:

From:
```typescript
{teamFullscreen && (
  <div className="flex-1 min-h-0 flex flex-col px-3 pb-2">
    <TeamCollaborationView />
  </div>
)}
```

To:
```typescript
<div className={`flex flex-col px-3 pb-2 transition-all duration-300 ease-in-out overflow-hidden ${teamVisible ? 'flex-1 min-h-0 opacity-100' : 'h-0 opacity-0 p-0'}`}>
  {teamCollaborationActive && <TeamCollaborationView />}
</div>
```

This approach:
- Keeps `TeamCollaborationView` mounted while `teamCollaborationActive` is true (for state preservation)
- Uses CSS transitions for smooth height/opacity animation
- The `h-0 opacity-0 p-0` classes collapse the container when not visible
- The `flex-1 min-h-0 opacity-100` classes expand it when visible

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add components/chat/ChatView.tsx
git commit -m "feat(ChatView): progressive team reveal with CSS transitions"
```

---

### Task 4: i18n — Add team activation key

**Files:**
- Modify: `lib/i18n/locales/en.ts:342`
- Modify: `lib/i18n/locales/zh.ts:342`

**Why:** Add a translation key for potential future use when team mode activates in project context.

- [ ] **Step 1: Add key to en.ts**

After the `team.collaboration.earlierSteps` key (line 342), add:

```typescript
'team.collaboration.activated': 'Team mode activated',
```

- [ ] **Step 2: Add key to zh.ts**

After the `team.collaboration.earlierSteps` key (line 342), add:

```typescript
'team.collaboration.activated': '团队模式已激活',
```

- [ ] **Step 3: Commit**

```bash
git add lib/i18n/locales/en.ts lib/i18n/locales/zh.ts
git commit -m "feat(i18n): add team activation translation key"
```

---

### Task 5: Verification

- [ ] **Step 1: Run TypeScript type-check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 2: Run existing tests**

Run: `npx jest --no-coverage 2>&1 | tail -20`
Expected: All existing tests pass (no regressions)

- [ ] **Step 3: Run dev server and manual verification**

Run: `npm run dev`

Manual test scenarios:
1. **Standalone chat (`/`)** — ChatInput should NOT show team view. Team collaboration area should not appear. Sending a message works normally.
2. **Project page (`/projects/[id]`)** — When server sends `team_update` SSE event: TeamStatusBar slides in smoothly, messages area shrinks with animation.
3. **Progressive reveal** — When `sub_agent_start` events arrive, team collaboration activates. AgentLane grid populates as agents start working.
4. **State persistence** — After streaming ends on project page, team view stays visible with last agent states. User can collapse/expand the TeamCollaborationView.
5. **Non-project chat** — After streaming ends on `/` (standalone chat), team view correctly hides as before.
6. **CSS transitions** — Verify the transition between foreman and team mode is smooth (300ms ease-in-out), not a jarring snap.

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address Phase 6 verification feedback"
```
