# Artifact Viewer Design Spec

## Overview

When the RebuilD agent creates or modifies a file (via `write`, `edit`, or `multi_edit` tools), the system should automatically display the file content in a right-side artifact panel (similar to Claude.ai's artifact experience), and embed an artifact reference card inline in the chat message.

## Requirements

1. **Auto-open**: When agent writes/edits a file, the right-side ArtifactsPanel opens automatically showing the file content with syntax highlighting
2. **Inline card**: The chat message that triggered the file operation displays an ArtifactRefCard (filename + type + download button)
3. **Close/reopen**: Clicking X closes the panel; clicking the inline card reopens it
4. **File types**: code, json, csv, excel, markdown, html, svg, image, pdf, pptx
5. **Content delivery**: File content is delivered inline via SSE event (no separate API call)
6. **Edit support**: `write` (create), `edit` (modify), and `multi_edit` (single-file, multi-edit-operation modify) tools all trigger artifact events
7. **SSE panel coexistence**: SSE panels (PlanPanel, ClarificationForm, etc.) retain priority over artifact panel; artifact data is stored and displayed once SSE panel closes. `openArtifact()` unconditionally sets `artifactPanelOpen: true`; DashboardShell's existing priority logic (`showArtifacts = !showRightPanel && artifactPanelOpen`) is the sole gatekeeper — no additional gating needed in the store.

## Architecture

### Data Flow

```
Agent calls write/edit tool
       |
tool.execute() completes, file written to disk
       |
chat-engine.ts onToolCallEnd callback
       |
Detects write/edit success -> reads file content from disk
       |
Emits SSE event: artifact_created
  {id, filePath, content, lineCount, artifactType, action, url?}
       |
Frontend ChatView receives SSE event
       |
1. Calls store.openArtifact() -> ArtifactsPanel auto-opens (existing flex-split panel)
2. Injects artifact reference into current streaming message metadata.artifacts[]
       |
MessageBubble detects metadata.artifacts -> renders ArtifactRefCard(s)
User clicks X -> panel closes, ArtifactRefCard remains in chat
User clicks card -> panel reopens with artifact content
```

### Panel Priority (unchanged)

```
SSE panels visible? -> Show SSE panel (fixed 420px right panel)
Else artifact open? -> Show ArtifactsPanel (flex-split, ~50% width, draggable)
Else               -> No right panel
```

## Backend Changes

### 1. New SSE Event Type

**File**: `lib/core/types.ts`

Add `artifact_created` to `ChatEventType` union.

New interface:

```typescript
interface ArtifactCreatedEventData {
  id: string;                                    // UUID
  filePath: string;                              // Relative to workspace root
  artifactType: string;                          // File type category
  content: string;                               // Full file content (inline), empty string for binary
  lineCount: number;                             // Number of lines
  action: 'created' | 'modified';                // write = created, edit = modified
  url?: string;                                  // For binary files: /api/files/{path}
}
```

Note: `language` is NOT included in the SSE event. The frontend `ArtifactsPanel` already infers language from filename via its existing `detectLanguage()` function. No need to duplicate this logic on the backend.

### 2. Artifact Event Emission

**File**: `lib/services/chat-engine.ts`

In the `onToolCallEnd` callback, when `toolName` is `write`, `edit`, or `multi_edit` and `success` is true:

1. Extract `filePath` from the tool call arguments (now available via the updated `args` param)
2. Determine if file is text or binary based on extension
3. For text files: read content with `fs.readFileSync(absolutePath, 'utf-8')`
4. For binary files (image, pdf, pptx, excel): set `content` to empty string; set `url` to `/api/files/${encodeURIComponent(relativePath)}` (see Section 4 below)
5. Infer `artifactType` from file extension:
   - `.ts/.tsx/.js/.jsx/.py/.go/.rs/.java/.c/.cpp/.sh/.yml/.yaml/.toml` -> type: `code`
   - `.json` -> type: `json`
   - `.md` -> type: `markdown`
   - `.csv` -> type: `csv`
   - `.xlsx/.xls` -> type: `excel`
   - `.html` -> type: `html`
   - `.svg` -> type: `svg`
   - `.png/.jpg/.jpeg/.gif/.webp` -> type: `image`
   - `.pdf` -> type: `pdf`
   - `.pptx` -> type: `pptx`
   - default -> type: `code`
6. Push `{ type: 'artifact_created', data: { ... } }` to the SSE channel
7. For `multi_edit`: extract the single `path` from args and emit one `artifact_created` event (same as `edit` — `multi_edit` operates on a single file with multiple edit operations)

### 3. Callback Signature Update

**File**: `lib/core/base-agent.ts`

The `onToolCallEnd` callback currently receives `{ toolName, toolCallId, result, success }`. Update to also include `args: string` (the raw JSON arguments string).

**All call sites to update**:
- `base-agent.ts` parallel execution path (~line 861): add `args` to the callback payload
- `base-agent.ts` sequential execution path (~line 935): add `args` to the callback payload
- `base-agent.ts` non-streaming `run()` method (if it has onToolCallEnd calls): add `args`

**File**: `lib/core/types.ts`

Update `AgentContext.onToolCallEnd` type definition:
```typescript
onToolCallEnd?: (params: {
  toolName: string;
  toolCallId: string;
  result: string;
  success: boolean;
  args: string;           // ← NEW: raw JSON arguments string
}) => void;
```

**File**: `lib/services/chat-engine.ts`

Update the `onToolCallEnd` handler to destructure and use `args`:
```typescript
const onToolCallEnd = (params: { toolName: string; toolCallId: string; result: string; success: boolean; args: string }) => {
  const toolLabel = ChatEngine.TOOL_LABELS[params.toolName] || params.toolName;
  channel.push({ type: 'tool_call_end', data: { ...params, toolLabel } });

  // Artifact detection
  if (params.success && ['write', 'edit', 'multi_edit'].includes(params.toolName)) {
    emitArtifactEvent(params.toolName, params.args, workspaceRoot);
  }
};
```

### 4. Binary File Serving Endpoint

**New file**: `app/api/files/[...path]/route.ts`

A new API route to serve workspace files for binary artifact types (images, PDFs, etc.) that cannot be inlined via SSE.

- Accepts GET requests with the relative file path
- Resolves against the project workspace root
- Validates the path is within the workspace (security boundary)
- Returns the file with appropriate Content-Type header
- Returns 404 if file not found

## Frontend Changes

### 1. Update `ArtifactRef` Type

**File**: `store/slices/artifactSlice.ts`

Extend the `ArtifactRef["type"]` union to include new types:

```typescript
type: 'code' | 'json' | 'pptx' | 'image' | 'markdown' | 'pdf' | 'csv' | 'excel' | 'html' | 'svg';
```

### 2. Update `openArtifact()` to Support Content Updates

**File**: `store/slices/artifactSlice.ts`

Modify `openArtifact()` so that when an artifact with the same `filePath` already exists in `openArtifacts`, it **replaces the content** instead of just focusing the tab. This handles the `edit` tool case where the same file is modified again.

```typescript
openArtifact(ref: ArtifactRef) {
  const existing = get().openArtifacts.find(a => a.filePath === ref.filePath);
  if (existing) {
    // Update content in place, keep same tab
    set({
      openArtifacts: get().openArtifacts.map(a =>
        a.filePath === ref.filePath ? { ...a, content: ref.content, url: ref.url } : a
      ),
      activeArtifactId: existing.id,
      artifactPanelOpen: true,
    });
  } else {
    // Existing logic: add new tab, enforce LRU, set active
    // ...
  }
}
```

### 3. ChatView SSE Event Handler

**File**: `components/chat/ChatView.tsx`

Add `artifact_created` case in SSE event handling:

```typescript
case 'artifact_created': {
  const { id, filePath, content, artifactType, lineCount, action, url } = event.data;

  // Extract filename (browser-safe, no Node path module)
  const filename = filePath.split('/').pop() || filePath;

  // 1. Open in ArtifactsPanel
  openArtifact({
    id,
    type: artifactType,
    filename,
    filePath,
    content: content || undefined,
    url: url || undefined,
  });

  // 2. Inject artifact reference into current message metadata
  injectArtifactRef({ id, filePath, filename, artifactType, action });
  break;
}
```

#### `injectArtifactRef` Implementation

ChatView uses a **Zustand store-based streaming model**: streaming tokens accumulate in `streamingSections` (store state), and the final assistant message is only created when the SSE `message` event arrives (which calls `addMessage`). There is no `streamingMessageRef`.

Approach: accumulate artifact refs in a **local ref** (`pendingArtifacts`) during streaming. When the `message` SSE event arrives and creates the final assistant message, merge the accumulated artifact refs into its metadata.

```typescript
// In ChatView component:
const pendingArtifactsRef = useRef<Array<{ id: string; filePath: string; filename: string; artifactType: string; action: string }>>([]);

// Called from the artifact_created SSE handler:
function injectArtifactRef(ref: { id: string; filePath: string; filename: string; artifactType: string; action: string }) {
  if (isStreaming) {
    // Accumulate during streaming — will be merged into the final message
    pendingArtifactsRef.current.push(ref);
  } else {
    // Not streaming: attach to the last assistant message
    const convId = activeConversationId;
    if (!convId) return;
    const messages = usePulseStore.getState().messages[convId] || [];
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      const meta = lastAssistant.metadata || {};
      const artifacts = [...(meta.artifacts || []), ref];
      lastAssistant.metadata = { ...meta, artifacts };
      setMessages(convId, [...messages]);
    }
  }
}

// In the 'message' SSE event handler, before addMessage():
case 'message': {
  // ... existing msg construction ...
  // Merge pending artifacts into message metadata
  if (pendingArtifactsRef.current.length > 0) {
    msg.metadata = {
      ...msg.metadata,
      artifacts: [...(msg.metadata?.artifacts || []), ...pendingArtifactsRef.current],
    };
    pendingArtifactsRef.current = [];  // Reset for next message
  }
  addMessage(conversationId, msg);
  resetStreamingState();
  break;
}
```

This ensures artifact refs are persisted with the message from the start — no post-hoc mutation needed.

**Persistence**: Artifact references are stored in `message.metadata.artifacts[]` which is already persisted to the database when the message is saved (the existing `saveMessage` flow serializes the full metadata object). On page reload, messages loaded from the API will include the artifact references, and `ArtifactRefCard` will render. However, the artifact **content** is NOT persisted in the database — it only lives in the Zustand store (ephemeral). When a user clicks an ArtifactRefCard after a page reload, the system will need to re-fetch the content via the `/api/files/` endpoint. This is acceptable because:
- The card itself is always visible (persisted in message metadata)
- Content is fetched on-demand when the card is clicked
- The `/api/files/` endpoint serves the current file from disk

### 4. MessageBubble Inline ArtifactRefCard

**File**: `components/chat/MessageBubble.tsx`

After rendering message content (markdown), check `message.metadata?.artifacts`:

```tsx
{message.metadata?.artifacts?.map((artifact) => (
  <ArtifactRefCard
    key={artifact.id}
    artifact={artifact}
  />
))}
```

### 5. ArtifactRefCard Enhancement

**File**: `components/chat/ArtifactRefCard.tsx`

Update to match Claude.ai card style:
- Left: type-specific icon (code brackets, file icon, etc.)
- Center: filename (title) + type label (subtitle, e.g. "Code . JSON")
- Right: Download button
- Click anywhere on card -> `openArtifact()` (if content not in store, fetch via `/api/files/` first)
- Show "Viewing" state when this artifact is currently active in panel

Extend `typeColorMap`, `typeIconMap`, `typeLabelMap` to include `csv`, `excel`, `html`, `svg`.

### 6. ArtifactsPanel New File Types

**File**: `components/layout/ArtifactsPanel.tsx`

Add rendering support for new types and extend `typeIconMap`, `typeLabelMap`, `ArtifactBody` switch:
- **CSV**: Parse and render as an HTML table with alternating row colors
- **Excel**: Show file info + download prompt (binary format, can't inline render)
- **HTML**: Render in sandboxed iframe (`sandbox="allow-scripts"`)
- **SVG**: Render via `<img src="data:image/svg+xml;base64,...">` (safe, no XSS risk — avoids `dangerouslySetInnerHTML`)

### 7. Dead Code Cleanup

Remove (verified unused — no imports found anywhere in codebase):
- `components/layout/RightPanel.tsx`
- `components/kanban/MiniKanban.tsx`
- Kanban-related dead methods in `store/slices/kanbanSlice.ts`

Keep:
- `rightPanel` prop and 420px SSE panel logic in `DashboardShell.tsx` — still used by SSE panels
- `artifactSlice` in store — this is the core state management we're building on

## File Type Mapping

| Extension | artifactType | language | Panel Rendering |
|-----------|-------------|----------|-----------------|
| .ts/.tsx | code | typescript | Syntax highlight |
| .js/.jsx | code | javascript | Syntax highlight |
| .py | code | python | Syntax highlight |
| .go | code | go | Syntax highlight |
| .rs | code | rust | Syntax highlight |
| .java | code | java | Syntax highlight |
| .c/.cpp | code | cpp | Syntax highlight |
| .sh | code | bash | Syntax highlight |
| .yml/.yaml | code | yaml | Syntax highlight |
| .toml | code | toml | Syntax highlight |
| .json | json | json | Syntax highlight |
| .md | markdown | — | MarkdownRenderer |
| .csv | csv | — | Table view |
| .xlsx/.xls | excel | — | Download prompt |
| .html | html | html | Sandboxed iframe |
| .svg | svg | — | Inline SVG render |
| .png/.jpg/.gif/.webp | image | — | `<img>` tag |
| .pdf | pdf | — | `<iframe>` embed |
| .pptx | pptx | — | Download prompt |
| other | code | auto-detect | Syntax highlight (fallback) |

## Edge Cases

1. **SSE panel active when artifact created**: `openArtifact()` unconditionally sets `artifactPanelOpen: true` and stores data. DashboardShell's `showArtifacts = !showRightPanel && artifactPanelOpen` ensures the panel only renders when no SSE panel is visible. No additional gating logic is needed.
2. **Multiple artifacts in one message**: `metadata.artifacts[]` is an array; panel shows the last one as active tab, all are accessible via tabs.
3. **Large files**: Content delivered inline via SSE. No special truncation — SSE can handle large payloads. If this becomes a problem in practice, we can add size limits later.
4. **Binary files (images, PDF, Excel, PPTX)**: SSE event has empty `content` and a `url` field pointing to `/api/files/{path}`. ArtifactsPanel uses `url` for rendering (existing support for `<img>` and `<iframe>`).
5. **Edit/multi_edit tool**: Same `artifact_created` event with `action: 'modified'`. If the artifact is already open in panel (matched by `filePath`), `openArtifact()` updates its content in place and focuses the tab.
6. **Page reload / conversation switch**: `message.metadata.artifacts[]` is persisted in the database (via existing message save flow). ArtifactRefCards render from persisted data. Artifact content is NOT in the database — when the user clicks a card after reload, content is fetched on-demand via `/api/files/{path}`.
7. **multi_edit tool**: `multi_edit` operates on a single file (one `path` with an array of `edits`). Emits one `artifact_created` event for that file, same as `edit`.
