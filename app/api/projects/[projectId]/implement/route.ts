/**
 * POST /api/projects/[projectId]/implement — Run implementation pipeline via SSE stream.
 *
 * Body: { repo_url: string, base_branch?: string }
 *
 * Prerequisites: Project must have a plan_result (prepare + plan already done).
 *
 * SSE events follow the same pattern as /execute:
 *   { type: 'agent_start', agent, step, total_steps }
 *   { type: 'agent_log', agent, message }
 *   { type: 'agent_complete', agent, output }
 *   { type: 'stage_complete', stage: 'implement', data }
 *   { type: 'result', data: ImplementResult }
 */

import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { messageBus } from '@/connectors/bus/message-bus';
import { runImplementation } from '@/skills/implement-pipeline';
import { supabase, assertSupabase } from '@/lib/db/client';
import { syncTaskStatus, clearProjectTasks } from '@/projects/project-service';
import { recordLlmUsage } from '@/lib/services/usage';
import { startTrace, recordEvent, completeTrace } from '@/lib/services/trace';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { repo_url, base_branch, project_name, resume } = body;
  const projectId = params.projectId;
  const sessionId = randomUUID();
  const streamScope = { projectId, sessionId, stage: 'implement' };

  startTrace(sessionId, projectId, 'implement');

  assertSupabase();

  // Fetch project to get PRD and plan
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
  }

  if (!project.plan_result) {
    return NextResponse.json(
      { success: false, error: 'Project must be planned before implementation' },
      { status: 400 }
    );
  }

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  let streamClosed = false;

  async function safeWrite(data: Uint8Array) {
    if (streamClosed) return;
    try {
      await writer.write(data);
    } catch {
      streamClosed = true;
    }
  }

  async function safeClose() {
    if (streamClosed) return;
    try {
      await writer.close();
    } catch {
      // already closed
    } finally {
      streamClosed = true;
    }
  }

  const taskStatusMap: Record<string, 'todo' | 'in-progress' | 'done'> = {
    pending: 'todo',
    running: 'in-progress',
    completed: 'done',
    failed: 'todo',
  };

  const recordUsage = (u: {
    agentName: string;
    projectId?: string;
    model?: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }) => {
    recordLlmUsage({
      projectId: u.projectId ?? projectId,
      agentName: u.agentName,
      model: u.model ?? undefined,
      promptTokens: u.prompt_tokens,
      completionTokens: u.completion_tokens,
      traceId: sessionId,
    }).catch((err) => console.error('[implement] Record usage failed:', err));
  };

  const unsubscribe = messageBus.onLog(async (message) => {
    const sseEvent = {
      type: message.type,
      agent: message.from,
      ...message.payload,
    };
    await safeWrite(encoder.encode(`data: ${JSON.stringify(sseEvent)}\n\n`));
    recordEvent(sessionId, message.type, message.from, message.payload);

    // Persist task status changes to the database
    if (message.type === 'task_update' && message.payload?.title) {
      const dbStatus = taskStatusMap[message.payload.status] || 'todo';
      syncTaskStatus(projectId, message.payload.title, dbStatus).catch((err) =>
        console.error('[implement] task sync error:', err)
      );
    }
  }, streamScope);

  // Run pipeline in background
  (async () => {
    // #region agent log
    fetch('http://127.0.0.1:7891/ingest/308aacb9-3b7c-48db-aea3-6543ee10f294',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'173eed'},body:JSON.stringify({sessionId:'173eed',location:'implement/route.ts:106',message:'implement pipeline started',data:{projectId,resume:!!resume},timestamp:Date.now(),hypothesisId:'A'})}).catch(() => { /* debug ingest — non-critical */ });
    // #endregion
    try {
      await messageBus.withScope(streamScope, async () => {
        // Only clear stale tasks when starting fresh (not resuming)
        if (!resume) {
          await clearProjectTasks(projectId);
        }

        // Update project status
        await supabase
          .from('projects')
          .update({ status: 'implementing' })
          .eq('id', projectId);

        // Determine local dir name: use project_name or fall back to sanitized project name
        const localDir = !repo_url
          ? (project_name || project.name || `project-${projectId}`).replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_')
          : undefined;

        const result = await runImplementation(
          {
            projectId,
            prd: project.plan_result?.prd || project.prepare_result,
            planResult: project.plan_result,
            repoUrl: repo_url || undefined,
            baseBranch: base_branch,
            localDir,
            previousPlan: project.implementation_plan || null,
          },
          {
            logger: async (msg: string) => {
              await safeWrite(
                encoder.encode(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`)
              );
            },
            recordUsage,
          }
        );

        // Update project — 'implemented' means awaiting user review before deploy
        const newStatus = result.status === 'success' ? 'implemented' : 'planned';
        const implementResult = {
          status: result.status,
          summary: result.summary,
          prUrl: result.prUrl,
          prNumber: result.prNumber,
          tasksCompleted: result.plan?.tasks.filter((t) => t.status === 'completed').length ?? 0,
          tasksTotal: result.plan?.tasks.length ?? 0,
          filesChanged: result.filesChanged,
          testsPassing: result.testsPassing,
        };

        await supabase
          .from('projects')
          .update({
            status: newStatus,
            pr_url: result.prUrl,
            workspace_id: result.workspace?.id,
            implement_result: implementResult,
            implementation_plan: result.plan,
          })
          .eq('id', projectId);

        // Bulk-sync all final task statuses to the tasks table so the DB
        // is consistent even if earlier fire-and-forget syncs were lost.
        if (result.plan?.tasks) {
          await Promise.allSettled(
            result.plan.tasks.map((t: any) => {
              const dbStatus = taskStatusMap[t.status] || 'todo';
              return syncTaskStatus(projectId, t.title, dbStatus);
            })
          );
        }

        // #region agent log
        fetch('http://127.0.0.1:7891/ingest/308aacb9-3b7c-48db-aea3-6543ee10f294',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'173eed'},body:JSON.stringify({sessionId:'173eed',location:'implement/route.ts:178',message:'implement pipeline completed',data:{projectId,status:result.status,taskCount:result.plan?.tasks?.length},timestamp:Date.now(),hypothesisId:'A'})}).catch(() => { /* debug ingest — non-critical */ });
        // #endregion
        await safeWrite(
          encoder.encode(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`)
        );
        completeTrace(sessionId, 'completed', {
          status: result.status,
          tasksCompleted: result.plan?.tasks.filter((t: any) => t.status === 'completed').length ?? 0,
          tasksTotal: result.plan?.tasks.length ?? 0,
        });
      });
    } catch (e: any) {
      console.error('[implement] Pipeline Error:', e);
      completeTrace(sessionId, 'failed', { error: e.message });
      await safeWrite(
        encoder.encode(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`)
      );
    } finally {
      unsubscribe();
      await safeClose();
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
