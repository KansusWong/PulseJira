# Artifact Viewer Design Spec

## Overview

When the RebuilD agent creates or modifies a file (via `write` or `edit` tools), the system should automatically display the file content in a right-side artifact panel (similar to Claude.ai's artifact experience), and embed an artifact reference card inline in the chat message.

## Requirements

1. **Auto-open**: When agent writes/edits a file, the right-side ArtifactsPanel opens automatically showing the file content with syntax highlighting
2. **Inline card**: The chat message that triggered the file operation displays an ArtifactRefCard (filename + type + download button)
3. **Close/reopen**: Clicking X closes the panel; clicking the inline card reopens it
4. **File types**: code, json, csv, excel, markdown, html, svg, image, pdf, pptx
5. **Content delivery**: File content is delivered inline via SSE event (no separate API call)
6. **Edit support**: Both `write` (create) and `edit` (modify) tools trigger artifact events
7. **SSE panel coexistence**: SSE panels (PlanPanel, ClarificationForm, etc.) retain priority over artifact panel; artifact data is stored and displayed once SSE panel closes

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
  {id, filePath, content, language, lineCount, artifactType, action}
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
  language?: string;                             // Syntax highlight language identifier
  content: string;                               // Full file content (inline)
  lineCount: number;                             // Number of lines
  action: 'created' | 'modified';                // write = created, edit = modified
}
```

### 2. Artifact Event Emission

**File**: `lib/services/chat-engine.ts`

In the `onToolCallEnd` callback, when `toolName` is `write` or `edit` and `success` is true:

1. Extract `filePath` from the tool call arguments (available via closure or added to the callback params)
2. Read file content with `fs.readFileSync(absolutePath, 'utf-8')`
3. Infer `artifactType` and `language` from file extension:
   - `.ts/.tsx/.js/.jsx/.py/.go/.rs/.java/.c/.cpp/.sh/.yml/.yaml/.toml` -> type: `code`, language: mapped
   - `.json` -> type: `json`, language: `json`
   - `.md` -> type: `markdown`
   - `.csv` -> type: `csv`
   - `.xlsx/.xls` -> type: `excel`
   - `.html` -> type: `html`
   - `.svg` -> type: `svg`
   - `.png/.jpg/.jpeg/.gif/.webp` -> type: `image`
   - `.pdf` -> type: `pdf`
   - `.pptx` -> type: `pptx`
   - default -> type: `code`, language: auto-detect
4. Push `{ type: 'artifact_created', data: { ... } }` to the SSE channel

**Argument access**: The `onToolCallEnd` callback currently receives `{ toolName, toolCallId, result, success }`. We need to also pass `args` (the original tool call arguments) so we can extract the file path. This requires a minor change to the callback signature in `base-agent.ts`.

### 3. Callback Signature Update

**File**: `lib/core/base-agent.ts`

Add `args` to the `onToolCallEnd` callback invocation so the chat engine can access the file path from tool arguments.

## Frontend Changes

### 1. ChatView SSE Event Handler

**File**: `components/chat/ChatView.tsx`

Add `artifact_created` case in SSE event handling:

```typescript
case 'artifact_created': {
  const { id, filePath, content, artifactType, language, lineCount, action } = event.data;

  // 1. Open in ArtifactsPanel
  openArtifact({
    id,
    type: artifactType,
    filename: path.basename(filePath),
    filePath,
    content,
  });

  // 2. Inject reference into current streaming message metadata
  // (or last assistant message if not streaming)
  injectArtifactRef(id, filePath, artifactType, action);
  break;
}
```

### 2. MessageBubble Inline ArtifactRefCard

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

### 3. ArtifactRefCard Enhancement

**File**: `components/chat/ArtifactRefCard.tsx`

Update to match Claude.ai card style:
- Left: type-specific icon (code brackets, file icon, etc.)
- Center: filename (title) + type label (subtitle, e.g. "Code . JSON")
- Right: Download button
- Click anywhere on card -> `openArtifact()`
- Show "Viewing" state when this artifact is currently active in panel

### 4. ArtifactsPanel New File Types

**File**: `components/layout/ArtifactsPanel.tsx`

Add rendering support for:
- **CSV**: Parse and render as an HTML table with alternating row colors
- **Excel**: Show file info + download prompt (binary format, can't inline render)
- **HTML**: Render in sandboxed iframe
- **SVG**: Render inline with `dangerouslySetInnerHTML` (sanitize first) or as `<img src="data:image/svg+xml;...">`

### 5. Dead Code Cleanup

Remove:
- `components/layout/RightPanel.tsx` — unused, never rendered
- `components/kanban/MiniKanban.tsx` — orphaned component
- Kanban-related dead methods in store (if any are truly unused)
- References to RightPanel imports (if any exist)

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

1. **SSE panel active when artifact created**: Artifact data stored in `artifactSlice`, panel shows once SSE panel closes (existing priority logic handles this)
2. **Multiple artifacts in one message**: `metadata.artifacts[]` is an array; panel shows the last one as active tab, all are accessible via tabs
3. **Large files**: Content delivered inline via SSE. No special truncation — SSE can handle large payloads. If this becomes a problem in practice, we can add size limits later.
4. **Binary files (images, PDF, Excel, PPTX)**: For `write` tool creating binary files, don't include `content` in the SSE event. Instead include a `url` field pointing to a static file serving endpoint (or the existing file path for local access). ArtifactsPanel already handles URL-based rendering for these types.
5. **Edit tool**: Same artifact_created event with `action: 'modified'`. If the artifact is already open in panel, update its content in place.
