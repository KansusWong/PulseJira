/**
 * POST /api/projects/[projectId]/deploy — Run deploy pipeline via SSE stream.
 *
 * Body: {
 *   pr_number: number,
 *   pr_url: string,
 *   repo_owner: string,
 *   repo_name: string,
 *   target?: 'vercel' | 'github-pages' | 'custom',
 *   vercel_project?: string,
 *   vercel_deploy_hook?: string,
 *   health_check_url?: string,
 *   auto_rollback?: boolean,
 * }
 *
 * Prerequisites: Project must have a pr_url (implement stage already done).
 *
 * SSE events:
 *   { type: 'agent_start', agent: 'deployer', step, total_steps }
 *   { type: 'log', message }
 *   { type: 'result', data: DeployResult }
 *   { type: 'error', error }
 */

import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { messageBus } from '@/connectors/bus/message-bus';
import { runDeployment } from '@/skills/deploy-pipeline';
import { supabase, assertSupabase } from '@/lib/db/client';
import { createSafeWriter, errorResponse } from '@/lib/utils/api-error';
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

  const projectId = params.projectId;
  const sessionId = randomUUID();
  const streamScope = { projectId, sessionId, stage: 'deploy' };

  startTrace(sessionId, projectId, 'deploy');
  const {
    pr_number,
    pr_url,
    repo_owner,
    repo_name,
    target = 'vercel',
    vercel_project,
    vercel_deploy_hook,
    health_check_url,
    auto_rollback,
  } = body;

  if (!pr_number || !repo_owner || !repo_name) {
    return errorResponse('pr_number, repo_owner, and repo_name are required', 400);
  }

  assertSupabase();

  // Fetch project
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return errorResponse('Project not found', 404);
  }

  // Gate: only allow deploy if project is in 'implemented' status (user reviewed)
  if (project.status !== 'implemented') {
    return errorResponse(
      `Deploy requires status 'implemented', current: '${project.status}'`,
      400
    );
  }

  // Set up SSE stream
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const safe = createSafeWriter(writer);

  const unsubscribe = messageBus.onLog(async (message) => {
    await safe.write({
      type: message.type,
      agent: message.from,
      ...message.payload,
    });
    recordEvent(sessionId, message.type, message.from, message.payload);
  }, streamScope);

  // Run pipeline in background
  (async () => {
    try {
      await messageBus.withScope(streamScope, async () => {
        // Update project status
        await supabase
          .from('projects')
          .update({ status: 'deploying' })
          .eq('id', projectId);

        const result = await runDeployment(
          {
            projectId,
            workspace: project.workspace_id ? { id: project.workspace_id } as any : {} as any,
            prNumber: pr_number,
            prUrl: pr_url || project.pr_url || '',
            repoOwner: repo_owner,
            repoName: repo_name,
            target,
            vercelProject: vercel_project,
            vercelDeployHook: vercel_deploy_hook,
            healthCheckUrl: health_check_url,
            autoRollback: auto_rollback ?? true,
          },
          {
            logger: async (msg: string) => {
              await safe.log(msg);
            },
          }
        );

        // Update project with result
        const updateFields: Record<string, any> = {
          deployment_status: result.state,
        };

        if (result.state === 'success') {
          updateFields.status = 'deployed';
          updateFields.deployment_url = result.deploymentUrl;
          updateFields.deployed_at = new Date().toISOString();
        } else {
          // Revert to previous status on failure
          updateFields.status = 'implementing';
        }

        await supabase
          .from('projects')
          .update(updateFields)
          .eq('id', projectId);

        await safe.write({ type: 'result', data: result });
        completeTrace(sessionId, 'completed');
      });
    } catch (e: any) {
      console.error('[deploy] Pipeline Error:', e);
      completeTrace(sessionId, 'failed', { error: e.message });
      await safe.write({ type: 'error', error: e.message });
    } finally {
      unsubscribe();
      await safe.close();
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
