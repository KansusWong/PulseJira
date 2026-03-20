# Artifact Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the RebuilD agent creates or edits a file, automatically display it in a right-side artifact panel (Claude.ai-style) with an inline reference card in the chat message.

**Architecture:** Backend emits `artifact_created` SSE events from the `onToolCallEnd` callback when write/edit/multi_edit tools succeed. Frontend ChatView handles the event by opening the existing ArtifactsPanel and injecting an ArtifactRefCard into the message. Content is delivered inline for text files, via `/api/files/` for binary files.

**Tech Stack:** Next.js (App Router), React, Zustand, TypeScript, highlight.js, SSE (EventSource)

**Spec:** `docs/superpowers/specs/2026-03-20-artifact-viewer-design.md`

---

### Task 1: Add `args` to `onToolCallEnd` callback signature

**Files:**
- Modify: `lib/core/types.ts:53-58` (AgentContext.onToolCallEnd type)
- Modify: `lib/core/base-agent.ts` — search for all `context.onToolCallEnd` calls (3 locations: parallel path, rejection path, sequential path)

- [ ] **Step 1: Update the type definition**

In `lib/core/types.ts`, add `args: string` to the `onToolCallEnd` params:

```typescript
// lib/core/types.ts:53-58
onToolCallEnd?: (params: {
  toolName: string;
  toolCallId: string;
  result: string;
  success: boolean;
  args: string;           // ← ADD: raw JSON arguments string
}) => void;
```

- [ ] **Step 2: Update parallel execution path**

In `lib/core/base-agent.ts`, search for `context.onToolCallEnd` in the parallel execution section (inside the `for` loop after `Promise.allSettled`). Add `args` to the callback:

```typescript
context.onToolCallEnd?.({
  toolName: tool.name,
  toolCallId: toolCall.id,
  result: preview,
  success: !isError,
  args: toolCall.function.arguments,   // ← ADD
});
```

- [ ] **Step 3: Update rejection path**

In `lib/core/base-agent.ts`, search for the `onToolCallEnd` call inside the `if (!approved)` block (rejection path). Add `args`:

```typescript
context.onToolCallEnd?.({ toolName, toolCallId: toolCall.id, result: resultStr, success: false, args: toolCall.function.arguments });
```

- [ ] **Step 4: Update sequential execution path**

In `lib/core/base-agent.ts`, search for the second `context.onToolCallEnd` call in the sequential `for` loop (after tool execution). Add `args`:

```typescript
context.onToolCallEnd?.({
  toolName,
  toolCallId: toolCall.id,
  result: preview,
  success: !isError,
  args: toolCall.function.arguments,   // ← ADD
});
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors related to `onToolCallEnd`

- [ ] **Step 6: Commit**

```bash
git add lib/core/types.ts lib/core/base-agent.ts
git commit -m "feat(agent): add args to onToolCallEnd callback signature"
```

---

### Task 2: Add `artifact_created` SSE event type

**Files:**
- Modify: `lib/core/types.ts:404-436` (ChatEventType union)

- [ ] **Step 1: Add event type to union**

In `lib/core/types.ts`, add `'artifact_created'` to the `ChatEventType` union (after `'tool_call_end'`):

```typescript
  | 'tool_call_end'
  | 'artifact_created'      // ← ADD
  | 'step_start'
```

- [ ] **Step 2: Add event data interface**

Add this interface after the `ChatEventType` definition in `lib/core/types.ts`:

```typescript
/** Data payload for artifact_created SSE events. */
export interface ArtifactCreatedEventData {
  id: string;
  filePath: string;
  artifactType: string;
  content: string;
  lineCount: number;
  action: 'created' | 'modified';
  url?: string;
  workspace?: string;              // Workspace root path, needed for re-fetching content after page reload
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/core/types.ts
git commit -m "feat(types): add artifact_created SSE event type and data interface"
```

---

### Task 3: Emit `artifact_created` events from chat-engine

**Files:**
- Modify: `lib/services/chat-engine.ts:514-517` (onToolCallEnd handler)

- [ ] **Step 1: Add artifact emission helper**

Add this helper function inside `chat-engine.ts` (above the `handleUnified` method, or at top of file):

```typescript
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ArtifactCreatedEventData } from '../core/types';

// File extension → artifact type mapping
const EXT_TO_ARTIFACT_TYPE: Record<string, string> = {
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code',
  py: 'code', go: 'code', rs: 'code', java: 'code',
  c: 'code', cpp: 'code', h: 'code', hpp: 'code',
  sh: 'code', yml: 'code', yaml: 'code', toml: 'code',
  css: 'code', scss: 'code', sql: 'code',
  json: 'json',
  md: 'markdown',
  csv: 'csv',
  xlsx: 'excel', xls: 'excel',
  html: 'html',
  svg: 'svg',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  pdf: 'pdf',
  pptx: 'pptx',
};

const BINARY_TYPES = new Set(['image', 'pdf', 'pptx', 'excel']);

function inferArtifactType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_ARTIFACT_TYPE[ext] || 'code';
}
```

- [ ] **Step 2: Update `onToolCallEnd` to emit artifact events**

In `chat-engine.ts`, update the `onToolCallEnd` callback (around line 514):

```typescript
const onToolCallEnd = (params: { toolName: string; toolCallId: string; result: string; success: boolean; args: string }) => {
  const toolLabel = ChatEngine.TOOL_LABELS[params.toolName] || params.toolName;
  channel.push({ type: 'tool_call_end', data: { ...params, toolLabel } });

  // Emit artifact_created for successful file operations
  if (params.success && ['write', 'edit', 'multi_edit'].includes(params.toolName)) {
    try {
      const parsedArgs = JSON.parse(params.args);
      const relPath: string = parsedArgs.path;
      if (!relPath || !workspace?.localPath) return;

      const absPath = path.resolve(workspace.localPath, relPath);
      const artifactType = inferArtifactType(relPath);
      const isBinary = BINARY_TYPES.has(artifactType);

      let content = '';
      let lineCount = 0;
      let url: string | undefined;

      if (isBinary) {
        url = `/api/files?path=${encodeURIComponent(relPath)}&workspace=${encodeURIComponent(workspace.localPath)}`;
      } else {
        try {
          content = fs.readFileSync(absPath, 'utf-8');
          lineCount = content.split('\n').length;
        } catch {
          // File read failed — skip artifact emission
          return;
        }
      }

      const artifactData: ArtifactCreatedEventData = {
        id: crypto.randomUUID(),
        filePath: relPath,
        artifactType,
        content,
        lineCount,
        action: params.toolName === 'write' ? 'created' : 'modified',
        ...(url ? { url } : {}),
        workspace: workspace.localPath,
      };

      channel.push({ type: 'artifact_created', data: artifactData });
    } catch {
      // JSON parse or other error — silently skip
    }
  }
};
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/services/chat-engine.ts
git commit -m "feat(chat-engine): emit artifact_created SSE events on file write/edit"
```

---

### Task 4: Create binary file serving API endpoint

**Files:**
- Create: `app/api/files/route.ts`

- [ ] **Step 1: Create the API route**

Create `app/api/files/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  html: 'text/html',
  json: 'application/json',
};

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path');
  const workspace = req.nextUrl.searchParams.get('workspace');

  if (!filePath || !workspace) {
    return NextResponse.json({ error: 'Missing path or workspace parameter' }, { status: 400 });
  }

  const absPath = path.resolve(workspace, filePath);

  // Security: ensure resolved path is inside workspace
  const normalizedWorkspace = path.normalize(workspace);
  const normalizedAbs = path.normalize(absPath);
  if (!normalizedAbs.startsWith(normalizedWorkspace)) {
    return NextResponse.json({ error: 'Path traversal denied' }, { status: 403 });
  }

  if (!fs.existsSync(absPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const contentType = MIME_MAP[ext] || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(absPath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
      'Cache-Control': 'no-cache',
    },
  });
}
```

- [ ] **Step 2: Verify the route loads**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/api/files/route.ts
git commit -m "feat(api): add /api/files endpoint for serving workspace files"
```

---

### Task 5: Extend `ArtifactRef` type and update `openArtifact()` for content updates

**Files:**
- Modify: `store/slices/artifactSlice.ts`

- [ ] **Step 1: Extend the type union**

In `store/slices/artifactSlice.ts:8`, update the `type` field:

```typescript
export interface ArtifactRef {
  id: string;
  type: 'code' | 'json' | 'pptx' | 'image' | 'markdown' | 'pdf' | 'csv' | 'excel' | 'html' | 'svg';
  filename: string;
  filePath?: string;
  content?: string;
  url?: string;
}
```

- [ ] **Step 2: Update `openArtifact()` to support content updates**

Replace the `openArtifact` method (lines 39-57):

```typescript
openArtifact: (ref) => {
  const { openArtifacts } = get();
  const existing = openArtifacts.find((a) => a.filePath && a.filePath === ref.filePath);

  if (existing) {
    // Same file already open — update content in place and focus tab
    set({
      openArtifacts: openArtifacts.map((a) =>
        a.filePath === ref.filePath
          ? { ...a, content: ref.content, url: ref.url }
          : a
      ),
      activeArtifactId: existing.id,
      artifactPanelOpen: true,
    });
  } else {
    // New artifact — add tab, focus, open panel
    set({
      openArtifacts: [...openArtifacts, ref],
      activeArtifactId: ref.id,
      artifactPanelOpen: true,
    });
  }

  // Auto-collapse sidebar when artifact panel opens
  get().autoCollapseSidebar();
},
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add store/slices/artifactSlice.ts
git commit -m "feat(store): extend ArtifactRef types and support content updates in openArtifact"
```

---

### Task 6: Handle `artifact_created` SSE event in ChatView

**Files:**
- Modify: `components/chat/ChatView.tsx`

- [ ] **Step 1: Add `pendingArtifactsRef` and store selectors**

Near the top of the ChatView component (around line 79 where other store selectors are), add:

```typescript
const openArtifact = usePulseStore((s) => s.openArtifact);
```

And add a ref for pending artifacts:

```typescript
const pendingArtifactsRef = useRef<Array<{ id: string; filePath: string; filename: string; artifactType: string; action: string; workspace?: string }>>([]);
```

Make sure `useRef` is in the imports from `react`.

- [ ] **Step 2: Add `artifact_created` case in SSE event handler**

In the `handleSSEEvent` callback (inside the `switch (event.type)` block, after `tool_call_end` or before `step_start`), add:

```typescript
case "artifact_created": {
  const { id, filePath, content, artifactType, lineCount, action, url } = event.data;
  const filename = filePath.split('/').pop() || filePath;

  // Open in ArtifactsPanel
  openArtifact({
    id,
    type: artifactType as any,
    filename,
    filePath,
    content: content || undefined,
    url: url || undefined,
  });

  // Accumulate for injection into final message (include workspace for re-fetch after reload)
  const artifactMeta = { id, filePath, filename, artifactType, action, workspace: event.data.workspace };

  if (isStreaming) {
    // During streaming: accumulate, will be merged when 'message' event arrives
    pendingArtifactsRef.current.push(artifactMeta);
  } else {
    // Not streaming: attach directly to last assistant message
    const convId = activeConversationId;
    if (convId) {
      const msgs = usePulseStore.getState().messages[convId] || [];
      const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        const meta = lastAssistant.metadata || {};
        lastAssistant.metadata = { ...meta, artifacts: [...(meta.artifacts || []), artifactMeta] };
        setMessages(convId, [...msgs]);
      }
    }
  }
  break;
}
```

- [ ] **Step 3: Merge pending artifacts into the `message` event handler**

In the existing `case "message"` handler (around line 543), after the `msg` object is constructed but BEFORE `addMessage`, insert:

```typescript
// Merge pending artifact references into message metadata
if (pendingArtifactsRef.current.length > 0) {
  msg.metadata = {
    ...msg.metadata,
    artifacts: [...(msg.metadata?.artifacts || []), ...pendingArtifactsRef.current],
  };
  pendingArtifactsRef.current = [];
}
```

This goes between line 553 (end of msg construction) and line 555 (`addMessage`).

- [ ] **Step 4: Reset pending artifacts on stream end/error**

In the `done` handler and error cleanup (where `resetStreamingState()` is called), add:

```typescript
pendingArtifactsRef.current = [];
```

This should be in the `finally` or cleanup sections where streaming state is reset (around lines 287, 320, 509).

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add components/chat/ChatView.tsx
git commit -m "feat(chat): handle artifact_created SSE event and inject refs into messages"
```

---

### Task 7: Render ArtifactRefCard inline in MessageBubble

**Files:**
- Modify: `components/chat/MessageBubble.tsx`

- [ ] **Step 1: Import ArtifactRefCard**

Add to imports in `MessageBubble.tsx`:

```typescript
import { ArtifactRefCard } from "./ArtifactRefCard";
```

- [ ] **Step 2: Render artifact cards after message content**

In the assistant message rendering section, after the MarkdownRenderer and before the ToolUsageSummary (around line 119), add:

```tsx
{/* Artifact reference cards */}
{message.metadata?.artifacts?.map((artifact: any) => {
  // Check if this artifact is already in the store (has content loaded)
  const storeArtifact = usePulseStore.getState().openArtifacts.find(
    (a) => a.filePath === artifact.filePath
  );
  return (
    <div key={artifact.id} className="mt-2 max-w-md">
      <ArtifactRefCard
        artifact={{
          id: artifact.id,
          type: (artifact.artifactType || artifact.type) as any,
          filename: artifact.filename,
          filePath: artifact.filePath,
          content: storeArtifact?.content,
          url: storeArtifact?.url,
        }}
        workspace={artifact.workspace}
      />
    </div>
  );
})}
```

Note: The artifact metadata stores `artifactType` (string from SSE), but ArtifactRefCard expects `ArtifactRef` with `type`. The mapping above handles both. We also pass `workspace` as a separate prop for re-fetch logic. The store lookup provides `content`/`url` if the artifact was opened in this session.

- [ ] **Step 3: Verify it renders correctly**

Run: `npm run dev`
Test: Send a message that triggers a file creation. Verify the ArtifactRefCard appears inline in the message below the markdown content.

- [ ] **Step 4: Commit**

```bash
git add components/chat/MessageBubble.tsx
git commit -m "feat(chat): render ArtifactRefCard inline in assistant messages"
```

---

### Task 8: Extend ArtifactRefCard with new types and Claude.ai card style

**Files:**
- Modify: `components/chat/ArtifactRefCard.tsx`

- [ ] **Step 1: Extend type maps**

Add new types to all three maps:

```typescript
import { FileCode, FileJson, FileImage, FileText, File, Presentation, FileSpreadsheet, Globe, Image } from "lucide-react";

const typeColorMap: Record<ArtifactRef["type"], string> = {
  code: "#c084fc",
  json: "#f4f4f5",
  pptx: "#f472b6",
  image: "#f4f4f5",
  markdown: "#34d399",
  pdf: "#60a5fa",
  csv: "#34d399",      // green
  excel: "#34d399",    // green
  html: "#f59e0b",     // amber
  svg: "#f4f4f5",      // white
};

const typeIconMap: Record<ArtifactRef["type"], React.ComponentType<{ className?: string }>> = {
  code: FileCode,
  json: FileJson,
  pptx: Presentation,
  image: FileImage,
  markdown: FileText,
  pdf: File,
  csv: FileSpreadsheet,
  excel: FileSpreadsheet,
  html: Globe,
  svg: Image,
};

const typeLabelMap: Record<ArtifactRef["type"], string> = {
  code: "Code",
  json: "JSON",
  pptx: "PPTX",
  image: "Image",
  markdown: "Markdown",
  pdf: "PDF",
  csv: "CSV",
  excel: "Excel",
  html: "HTML",
  svg: "SVG",
};
```

- [ ] **Step 2: Update card to Claude.ai style with Download button**

Replace the component JSX to include a Download button:

Also update the props interface:

```typescript
interface ArtifactRefCardProps {
  artifact: ArtifactRef;
  isActive?: boolean;
  workspace?: string;       // Workspace path for re-fetching content after page reload
}
```

```tsx
export function ArtifactRefCard({ artifact, isActive = false, workspace }: ArtifactRefCardProps) {
  const openArtifact = usePulseStore((s) => s.openArtifact);
  const activeArtifactId = usePulseStore((s) => s.activeArtifactId);
  const artifactPanelOpen = usePulseStore((s) => s.artifactPanelOpen);

  const isViewing = artifactPanelOpen && activeArtifactId === artifact.id;

  const handleClick = useCallback(async () => {
    // If content or url already available, open directly
    if (artifact.content || artifact.url) {
      openArtifact(artifact);
      return;
    }
    // Otherwise, fetch content via /api/files (needed after page reload)
    if (artifact.filePath && workspace) {
      try {
        const params = new URLSearchParams({ path: artifact.filePath, workspace });
        const res = await fetch(`/api/files?${params}`);
        if (res.ok) {
          const content = await res.text();
          openArtifact({ ...artifact, content });
          return;
        }
      } catch { /* fall through */ }
    }
    openArtifact(artifact);
  }, [openArtifact, artifact, workspace]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (artifact.url) {
      window.open(artifact.url, "_blank");
    } else if (artifact.content) {
      const blob = new Blob([artifact.content], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = artifact.filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [artifact]);

  const color = typeColorMap[artifact.type] || "#f4f4f5";
  const Icon = typeIconMap[artifact.type] || File;
  const typeLabel = typeLabelMap[artifact.type] || artifact.type.toUpperCase();

  // Derive sub-label (e.g., "Code · TypeScript")
  const ext = artifact.filename.split('.').pop()?.toUpperCase() || '';
  const subLabel = artifact.type === 'code' ? `Code · ${ext}` : typeLabel;

  return (
    <button
      onClick={handleClick}
      className={clsx(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
        "bg-[var(--bg-glass)] border transition-all text-left cursor-pointer",
        "hover:border-[var(--border-accent)]",
        isViewing
          ? "border-[var(--border-accent)]"
          : "border-[var(--border-subtle)]",
      )}
    >
      {/* Type icon */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <span style={{ color }}>
          <Icon className="w-4 h-4" />
        </span>
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
          {artifact.filename}
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {isViewing ? (
            <span style={{ color }}>{subLabel} &middot; Viewing</span>
          ) : (
            <span>{subLabel}</span>
          )}
        </div>
      </div>

      {/* Download button */}
      {(artifact.content || artifact.url) && (
        <button
          onClick={handleDownload}
          className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
        >
          Download
        </button>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/ArtifactRefCard.tsx
git commit -m "feat(artifact-card): extend with new types, Claude.ai card style, and Download button"
```

---

### Task 9: Extend ArtifactsPanel with new file type renderers

**Files:**
- Modify: `components/layout/ArtifactsPanel.tsx`

- [ ] **Step 1: Extend type maps in ArtifactsPanel**

Update `typeIconMap` and `typeLabelMap` (lines 24-40) to include new types:

```typescript
import { FileCode, FileJson, FileImage, FileText, File, Presentation, FileSpreadsheet, Globe, Image } from "lucide-react";

const typeIconMap: Record<ArtifactRef["type"], React.ComponentType<{ className?: string }>> = {
  code: FileCode,
  json: FileJson,
  pptx: Presentation,
  image: FileImage,
  markdown: FileText,
  pdf: File,
  csv: FileSpreadsheet,
  excel: FileSpreadsheet,
  html: Globe,
  svg: Image,
};

const typeLabelMap: Record<ArtifactRef["type"], string> = {
  code: "Code",
  json: "JSON",
  pptx: "PPTX",
  image: "Image",
  markdown: "Markdown",
  pdf: "PDF",
  csv: "CSV",
  excel: "Excel",
  html: "HTML",
  svg: "SVG",
};
```

- [ ] **Step 2: Add HtmlViewer and CsvViewer sub-components**

Add before the `ArtifactBody` function.

**HtmlViewer** (avoids blob URL memory leak by using useMemo + useEffect cleanup):

```tsx
function HtmlViewer({ content, filename }: { content: string; filename: string }) {
  const blobUrl = useMemo(() => {
    const blob = new Blob([content], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [content]);

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  return (
    <div className="flex-1 overflow-hidden">
      <iframe src={blobUrl} title={filename} sandbox="allow-scripts" className="w-full h-full border-0 bg-white" />
    </div>
  );
}
```

Make sure `useEffect` is imported from `react`.

**CsvViewer**:

```tsx
function CsvViewer({ content }: { content: string }) {
  const rows = useMemo(() => {
    return content.split('\n').filter(Boolean).map(row => {
      // Simple CSV parsing (handles basic cases)
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of row) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
        current += char;
      }
      cells.push(current.trim());
      return cells;
    });
  }, [content]);

  if (rows.length === 0) return <DownloadPrompt artifact={{ id: '', type: 'csv', filename: 'data.csv', content }} />;

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="sticky top-0 bg-[#111] px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-[var(--text-secondary)] border-b border-[var(--border-subtle)]/30 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Add new cases to ArtifactBody switch**

Update the `ArtifactBody` function to handle new types:

```typescript
function ArtifactBody({ artifact }: { artifact: ArtifactRef }) {
  switch (artifact.type) {
    case "code":
    case "json":
      if (!artifact.content) return <DownloadPrompt artifact={artifact} />;
      return <CodeViewer content={artifact.content} filename={artifact.filename} type={artifact.type} />;

    case "markdown":
      if (!artifact.content) return <DownloadPrompt artifact={artifact} />;
      return (
        <div className="flex-1 overflow-auto p-6">
          <MarkdownRenderer content={artifact.content} />
        </div>
      );

    case "csv":
      if (!artifact.content) return <DownloadPrompt artifact={artifact} />;
      return <CsvViewer content={artifact.content} />;

    case "html":
      if (artifact.content) {
        return <HtmlViewer content={artifact.content} filename={artifact.filename} />;
      }
      if (artifact.url) {
        return (
          <div className="flex-1 overflow-hidden">
            <iframe src={artifact.url} title={artifact.filename} sandbox="allow-scripts" className="w-full h-full border-0 bg-white" />
          </div>
        );
      }
      return <DownloadPrompt artifact={artifact} />;

    case "svg":
      if (artifact.content) {
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(artifact.content)))}`;
        return (
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={svgDataUrl} alt={artifact.filename} className="max-w-full max-h-full object-contain" />
          </div>
        );
      }
      return <DownloadPrompt artifact={artifact} />;

    case "image":
      if (artifact.url) {
        return (
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artifact.url} alt={artifact.filename} className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        );
      }
      return <DownloadPrompt artifact={artifact} />;

    case "pdf":
      if (artifact.url) {
        return (
          <div className="flex-1 overflow-hidden">
            <iframe src={artifact.url} title={artifact.filename} className="w-full h-full border-0" />
          </div>
        );
      }
      return <DownloadPrompt artifact={artifact} />;

    case "pptx":
    case "excel":
      return <DownloadPrompt artifact={artifact} />;

    default:
      return <DownloadPrompt artifact={artifact} />;
  }
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add components/layout/ArtifactsPanel.tsx
git commit -m "feat(artifacts-panel): add CSV, HTML, SVG, Excel renderers"
```

---

### Task 10: (Absorbed into Tasks 3, 6, 7, 8)

Content re-fetch on reload is now handled by:
- Task 3: SSE event includes `workspace` field
- Task 6: `pendingArtifactsRef` stores `workspace` in metadata
- Task 7: MessageBubble passes `workspace` as prop to ArtifactRefCard
- Task 8: ArtifactRefCard `handleClick` fetches from `/api/files?path=...&workspace=...` when content is missing

No separate task needed.

---

### Task 11: Clean up dead Kanban code

**Files:**
- Delete: `components/layout/RightPanel.tsx`
- Delete: `components/kanban/MiniKanban.tsx`
- Modify: `store/slices/kanbanSlice.ts` (remove dead methods)

- [ ] **Step 1: Verify RightPanel has no imports**

Run: `grep -r "RightPanel" --include="*.tsx" --include="*.ts" -l`
Expected: Only `components/layout/RightPanel.tsx` itself (no importers)

- [ ] **Step 2: Verify MiniKanban has no imports outside RightPanel**

Run: `grep -r "MiniKanban" --include="*.tsx" --include="*.ts" -l`
Expected: Only `components/kanban/MiniKanban.tsx` and `components/layout/RightPanel.tsx`

- [ ] **Step 3: Delete dead files**

```bash
git rm components/layout/RightPanel.tsx
git rm components/kanban/MiniKanban.tsx
```

- [ ] **Step 4: Audit kanbanSlice for dead methods**

Check which methods in `store/slices/kanbanSlice.ts` are actually used by searching for each method name across the codebase. Remove any methods that are never called from outside the slice itself. Be careful: `kanbanSlice.ts` is still imported by `KanbanBoard.tsx`, `KanbanColumn.tsx`, etc. — only remove methods that have zero external callers.

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add store/slices/kanbanSlice.ts
git commit -m "chore: remove dead RightPanel, MiniKanban, and unused kanban methods"
```

---

### Task 12: End-to-end manual testing

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test file creation artifact flow**

1. Open a conversation, ask the agent to create a JSON file
2. Verify: Right-side ArtifactsPanel opens automatically with syntax-highlighted JSON
3. Verify: ArtifactRefCard appears inline in the chat message
4. Verify: Card shows filename, "JSON" type label, and Download button

- [ ] **Step 3: Test close and reopen**

1. Click X on the ArtifactsPanel header
2. Verify: Panel closes, ArtifactRefCard remains in chat
3. Click the ArtifactRefCard
4. Verify: Panel reopens with the same content

- [ ] **Step 4: Test file edit artifact flow**

1. Ask the agent to edit an existing file
2. Verify: ArtifactsPanel updates with modified content
3. Verify: A second ArtifactRefCard appears in the message

- [ ] **Step 5: Test SSE panel priority**

1. Trigger a clarification form or plan panel
2. Then trigger a file creation
3. Verify: SSE panel stays visible, artifact data stored in background
4. Close the SSE panel
5. Verify: ArtifactsPanel appears with the artifact

- [ ] **Step 6: Test page reload persistence**

1. After an artifact card is visible in chat, reload the page
2. Verify: ArtifactRefCard still shows in the reloaded chat
3. Click the card
4. Verify: Content is fetched and displayed in the panel

- [ ] **Step 7: Test Download button**

1. Click Download on an ArtifactRefCard
2. Verify: File downloads correctly
