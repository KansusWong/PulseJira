import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { runProjectPrepare, runProjectPreparePOC, runProjectPlan } from '@/projects/project-runner';
import { messageBus } from '@/connectors/bus/message-bus';
import { recordLlmUsage } from '@/lib/services/usage';
import { createSafeWriter } from '@/lib/utils/api-error';
import { startTrace, recordEvent, completeTrace } from '@/lib/services/trace';
import { updateProject, getProject } from '@/projects/project-service';

/**
 * POST /api/projects/[projectId]/execute — Run Agent pipeline via SSE stream.
 *
 * Body: { stage: 'prepare' | 'plan', description, urls?, signalId?, confirmed_proposal? }
 *
 * SSE events:
 *   { type: 'agent_start', agent, step, total_steps }
 *   { type: 'agent_log', agent, message }
 *   { type: 'agent_tool', agent, tool, args }
 *   { type: 'agent_complete', agent, output }
 *   { type: 'stage_complete', stage, data }
 *   { type: 'pipeline_complete', data }
 */
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

  const { stage, description, urls = [], signalId, confirmed_proposal, resume } = body;
  const projectId = params.projectId;
  const sessionId = randomUUID();
  const resolvedStage = ['prepare', 'prepare-poc', 'plan'].includes(stage) ? stage : 'execute';
  const streamScope = {
    projectId,
    sessionId,
    stage: resolvedStage,
  };

  startTrace(sessionId, projectId, resolvedStage);

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
    }).catch((err) => console.error('[execute] Record usage failed:', err));
  };

  // --- Agent logs accumulator (debounced flush to DB) ---
  const accumulatedLogs: Array<{ agent: string; type: string; message: string; timestamp: number; taskId?: string; taskTitle?: string }> = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const FLUSH_INTERVAL_MS = 10_000;
  const FLUSH_BATCH_SIZE = 20;

  const flushLogs = async () => {
    if (accumulatedLogs.length === 0) return;
    try { await updateProject(projectId, { agent_logs: [...accumulatedLogs] }); }
    catch (err) { console.error('[execute] Flush agent logs failed:', err); }
  };
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => { flushTimer = null; await flushLogs(); }, FLUSH_INTERVAL_MS);
  };

  // --- Load checkpoint for resume ---
  let checkpoint: import('@/projects/types').PipelineCheckpoint | null = null;
  if (resume === true) {
    try {
      const proj = await getProject(projectId);
      checkpoint = proj?.pipeline_checkpoint ?? null;
    } catch (err) {
      console.error('[execute] Load checkpoint failed:', err);
    }
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const safe = createSafeWriter(writer);

  // Subscribe to message bus and forward to SSE (project/session scoped)
  const unsubscribe = messageBus.onLog(async (message) => {
    await safe.write({
      type: message.type,
      agent: message.from,
      ...message.payload,
    });
    recordEvent(sessionId, message.type, message.from, message.payload);

    // Accumulate logs for persistence
    if (message.type === 'agent_log') {
      accumulatedLogs.push({
        agent: message.from || 'system',
        type: message.type,
        message: message.payload?.message || '',
        timestamp: Date.now(),
        taskId: message.payload?.taskId,
        taskTitle: message.payload?.taskTitle,
      });
      if (accumulatedLogs.length % FLUSH_BATCH_SIZE === 0) {
        await flushLogs();
      } else {
        scheduleFlush();
      }
    }
  }, streamScope);

  (async () => {
    try {
      // Clear old logs at pipeline start
      await updateProject(projectId, { agent_logs: [] }).catch(() => {});

      await messageBus.withScope(streamScope, async () => {
        let result: any;

        if (stage === 'prepare') {
          result = await runProjectPrepare(projectId, description || '', urls, {
            projectId,
            logger: (msg: string) => safe.log(msg),
            recordUsage,
          }, checkpoint);
        } else if (stage === 'prepare-poc') {
          result = await runProjectPreparePOC(projectId, description || '', urls, {
            projectId,
            logger: (msg: string) => safe.log(msg),
            recordUsage,
          }, checkpoint);
        } else if (stage === 'plan') {
          if (!signalId) throw new Error('Signal ID required for plan stage');
          result = await runProjectPlan(
            projectId,
            signalId,
            confirmed_proposal || description,
            { projectId, logger: (msg: string) => safe.log(msg), recordUsage },
            checkpoint
          );
        } else {
          throw new Error(`Invalid stage: ${stage}`);
        }

        await safe.write({ type: 'result', data: result });
        completeTrace(sessionId, 'completed');
      });
    } catch (e: any) {
      console.error('Pipeline Error:', e);
      completeTrace(sessionId, 'failed', { error: e.message });
      await safe.write({ type: 'error', error: e.message });
    } finally {
      unsubscribe();
      // Final flush of accumulated logs
      if (flushTimer) clearTimeout(flushTimer);
      await flushLogs();
      await safe.close();
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
