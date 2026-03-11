/**
 * Meta Pipeline API — top-level endpoint for the adaptive agent system.
 *
 * POST /api/meta
 *
 * Body:
 *   description: string | string[]   — single requirement or batch signals
 *   projectId?:  string
 *   repoUrl?:    string
 *   skipDecision?: boolean           — skip Decision Maker, go straight to Architect
 *   signalIds?:  string[]            — associated signal IDs
 *
 * Response: SSE stream with log events and final result.
 */

import { NextResponse } from 'next/server';
import { runMetaPipeline } from '@/skills/meta-pipeline';
import { makeSSEResponse, errorResponse } from '@/lib/utils/api-error';
import { messageBus } from '@/connectors/bus/message-bus';
import { Blackboard } from '@/lib/blackboard';

// Extend Vercel serverless function timeout to max allowed (#13)
export const maxDuration = 300;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { description, projectId, repoUrl, skipDecision, signalIds } = body;

  if (!description) {
    return errorResponse('description is required (string or string[])', 400);
  }

  // Unique session ID to scope messageBus events per request (#12)
  const sessionId = crypto.randomUUID();

  const blackboard = new Blackboard(`meta-${sessionId}`, projectId, {
    maxEntries: 200,
    ttlMs: 2 * 60 * 60 * 1000,
  });

  return makeSSEResponse(
    async (safe) => {
      return messageBus.withScope({ projectId, sessionId }, async () => {
        const result = await runMetaPipeline(description, {
          projectId,
          repoUrl,
          skipDecision,
          signalIds,
          blackboard,
          logger: (msg: string) => safe.log(msg),
        });

        return result;
      });
    },
    { signal: req.signal },
  );
}
