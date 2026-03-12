import { NextResponse } from 'next/server';
import { storeSignal } from '@/lib/services/rag';
import { updateSignalStatus } from '@/lib/services/signal';
import { runPrepare } from '@/skills/prepare-pipeline';
import { runPlan } from '@/lib/skills/plan';
import { suggestCompetitorUrl } from '@/lib/skills/suggest-url';
import { makeSSEResponse, errorResponse } from '@/lib/utils/api-error';
import { recordLlmUsage } from '@/lib/services/usage';
import { messageBus } from '@/connectors/bus/message-bus';

// Extend Vercel serverless function timeout to max allowed (#13)
export const maxDuration = 300;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, urls, description, stage = 'prepare', signalId, confirmed_proposal } = body;
  const targetUrls: string[] = urls || (url ? [url] : []);

  // --- STREAMING STAGE: PREPARE (Circuit Breaker) ---
  if (stage === 'prepare') {
    const sessionId = crypto.randomUUID();
    return makeSSEResponse(
      async (safe) => {
        return messageBus.withScope({ sessionId }, async () => {
          // 1. Store Signal (if new)
          let currentSignalId = signalId;
          if (!currentSignalId) {
            const urlText = targetUrls.length > 0
              ? targetUrls.map(u => `Reference/Competitor URL: ${u}`).join('\n')
              : '';
            const mockContent = `New Idea: ${description || 'No description provided.'}\n` +
              (urlText ? `${urlText}\n` : '') +
              `Context: Please analyze the idea${urlText ? ' and the provided reference URLs' : ''}.`;

            const signalSource = targetUrls.join(',') || 'user-input-idea';
            const signal = await storeSignal(signalSource, mockContent);
            if (signal) currentSignalId = signal.id;

            await safe.log(`[System] Signal stored with ID: ${currentSignalId}`);
          }

          const analyzeRecordUsage = (u: {
            agentName: string;
            projectId?: string;
            model?: string;
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          }) => {
            recordLlmUsage({
              projectId: u.projectId ?? null,
              agentName: u.agentName,
              model: u.model ?? null,
              promptTokens: u.prompt_tokens,
              completionTokens: u.completion_tokens,
            }).catch((err) => console.error('[analyze] Record usage failed:', err));
          };

          // 2. Run Prepare Skill (Circuit Breaker)
          await safe.log('[System] Initializing Circuit Breaker analysis...');
          const prepareResult = await runPrepare(description || 'No description', {
            signalId: currentSignalId,
            logger: (msg: string) => safe.log(msg),
            recordUsage: analyzeRecordUsage,
          });

          if (currentSignalId) {
            await updateSignalStatus(currentSignalId, 'ANALYZED');
          }

          await safe.log(`[Prepare] Analysis Complete. Decision: ${prepareResult.decision}`);

          return {
            ...prepareResult,
            signalId: currentSignalId,
          };
        });
      },
      { signal: req.signal },
    );
  }

  // --- STREAMING STAGE: PLAN ---
  if (stage === 'plan') {
    const sessionId = crypto.randomUUID();
    return makeSSEResponse(
      async (safe) => {
        return messageBus.withScope({ sessionId }, async () => {
          const requirementContent = confirmed_proposal || description;

          // Run Plan Skill (PM → Tech Lead)
          await safe.log('[System] Initializing Planning pipeline...');
          const planResult = await runPlan(requirementContent, {
            signalId,
            logger: (msg: string) => safe.log(msg),
          });

          return planResult;
        });
      },
      { signal: req.signal },
    );
  }

  // --- SYNC STAGES (Suggest URL, Approve) ---

  if ((targetUrls.length === 0 && !description) || (description && typeof description !== 'string')) {
    return NextResponse.json({ success: false, error: 'URL(s) or Description is required' }, { status: 400 });
  }

  // Check Supabase
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      success: true,
      data: {
        featureName: 'Mock Response (No DB)',
        score: 0,
        decision: 'NO_GO',
        rationale: 'Supabase keys missing.',
        prd: {},
        tasks: [],
      },
    });
  }

  try {
    if (stage === 'suggest_url') {
      if (!description) return errorResponse('Description required', 400);
      const suggestion = await suggestCompetitorUrl(description);
      return NextResponse.json({ success: true, stage: 'suggest_url', data: suggestion });
    }

    if (stage === 'approve') {
      if (!signalId) return errorResponse('Signal ID required', 400);
      await updateSignalStatus(signalId, 'APPROVED', confirmed_proposal);
      return NextResponse.json({ success: true, stage: 'approve' });
    }

    return errorResponse('Invalid stage', 400);
  } catch (error: any) {
    console.error('[API Error] POST /api/analyze:', error);
    return errorResponse(error.message || 'Server Error');
  }
}
