/**
 * /api/projects/[projectId]/preview — Manage local dev server previews.
 *
 * POST  — Start a preview dev server (SSE stream with progress).
 * GET   — Query current preview status (for page reload recovery).
 * DELETE — Stop the running preview server.
 */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { previewManager } from '@/lib/sandbox/preview-manager';
import { supabase, assertSupabase } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWorkspacePath(projectName: string, projectId: string): string | null {
  const dirName = (projectName || `project-${projectId}`)
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_');
  const absPath = path.join(process.cwd(), 'projects', dirName);
  return fs.existsSync(absPath) ? absPath : null;
}

// ---------------------------------------------------------------------------
// POST — Start preview (SSE)
// ---------------------------------------------------------------------------

export async function POST(
  _req: Request,
  { params }: { params: { projectId: string } },
) {
  const projectId = params.projectId;

  // Check if already running
  const existing = previewManager.getStatus(projectId);
  if (existing?.status === 'ready') {
    return NextResponse.json({ success: true, data: existing });
  }

  assertSupabase();

  // Fetch project name to resolve workspace path
  const { data: project, error } = await supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    return NextResponse.json(
      { success: false, error: 'Project not found' },
      { status: 404 },
    );
  }

  const workspacePath = resolveWorkspacePath(project.name, projectId);
  if (!workspacePath) {
    return NextResponse.json(
      { success: false, error: 'Workspace directory not found' },
      { status: 404 },
    );
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  let streamClosed = false;

  async function send(data: Record<string, unknown>) {
    if (streamClosed) return;
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      streamClosed = true;
    }
  }

  (async () => {
    try {
      const result = await previewManager.start(
        projectId,
        workspacePath,
        (session) => {
          send({ type: 'status', ...session });
        },
      );

      await send({ type: 'result', data: result });
    } catch (e: any) {
      await send({ type: 'error', error: e.message });
    } finally {
      if (!streamClosed) {
        try { await writer.close(); } catch { /* already closed */ }
      }
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ---------------------------------------------------------------------------
// GET — Query preview status
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: { projectId: string } },
) {
  const session = previewManager.getStatus(params.projectId);
  return NextResponse.json({ success: true, data: session });
}

// ---------------------------------------------------------------------------
// DELETE — Stop preview
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: Request,
  { params }: { params: { projectId: string } },
) {
  await previewManager.stop(params.projectId);
  return NextResponse.json({ success: true });
}
