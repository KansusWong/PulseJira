/**
 * POST /api/signals/[signalId]/quick-discuss
 *
 * "Queue-jump" a signal into immediate red/blue team discussion.
 * Runs the full Prepare pipeline (Researcher → Blue Team → Red Team → Arbitrator),
 * creates a project from the results, and marks the signal as ANALYZED.
 *
 * Returns the updated signal row so the UI can render the analysis inline.
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';
import { generateJSON } from '@/lib/core/llm';
import { runPrepare, type PrepareResult } from '@/skills/prepare-pipeline';
import { recordLlmUsage } from '@/lib/services/usage';

interface ScreeningResult {
  relevant: boolean;
  score: number;
  title: string;
  summary: string;
  reason: string;
}

const SCREENING_PROMPT = `You are a product signal screener. Given a piece of content scraped from the internet, determine if it represents a viable product idea, feature request, pain point, or market opportunity.

Score from 0-100 based on:
- Clarity: Is the need clearly expressed?
- Demand: Does it suggest significant user demand?
- Feasibility: Is it something that could be built?
- Novelty: Is it an interesting or underserved area?

Respond in JSON only:
{
  "relevant": true/false,
  "score": 0-100,
  "title": "Suggested project title (3-8 words)",
  "summary": "One-line summary of the opportunity",
  "reason": "Brief explanation of your scoring"
}`;

function makeRecordUsage(projectId?: string) {
  return (params: {
    agentName: string;
    projectId?: string;
    model?: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }) => {
    recordLlmUsage({
      projectId: params.projectId ?? projectId ?? null,
      agentName: params.agentName,
      model: params.model ?? null,
      promptTokens: params.prompt_tokens,
      completionTokens: params.completion_tokens,
    }).catch((err) => console.error('[quick-discuss] Record usage failed:', err));
  };
}

export async function POST(
  _req: Request,
  { params }: { params: { signalId: string } }
) {
  try {
    assertSupabase();
    const signalId = params.signalId;

    const { data: signal, error: sigErr } = await supabase
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .single();

    if (sigErr || !signal) {
      return errorResponse('Signal not found', 404);
    }

    // Idempotency: if already processing, return current row so UI can restore progress.
    if (signal.status === 'PROCESSING') {
      return NextResponse.json({
        success: true,
        data: {
          signal,
          project: null,
          prepare_result: signal.metadata?.prepare_result || null,
        },
      });
    }

    // Idempotency: if already analyzed, avoid re-running pipeline.
    if (signal.status === 'ANALYZED' && signal.metadata?.prepare_result) {
      return NextResponse.json({
        success: true,
        data: {
          signal,
          project: null,
          prepare_result: signal.metadata.prepare_result,
        },
      });
    }

    // --- 1. Screening (reuse existing or run fresh) ---
    let screening: ScreeningResult | null =
      signal.metadata?.screening ?? null;

    if (!screening) {
      const context = [
        signal.platform ? `[Source: ${signal.platform}]` : '',
        signal.source_url ? `[URL: ${signal.source_url}]` : '',
        '',
        signal.content,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        screening = (await generateJSON(SCREENING_PROMPT, context, {
          agentName: 'signal-screener',
        })) as ScreeningResult;
      } catch (e: any) {
        console.error(
          `[quick-discuss] Screening failed for ${signalId}:`,
          e.message
        );
        screening = {
          relevant: true,
          score: 50,
          title: signal.content?.slice(0, 60) || 'Untitled Signal',
          summary: signal.content?.slice(0, 200) || '',
          reason: 'Screening skipped (error); proceeding with discussion.',
        };
      }

      await supabase
        .from('signals')
        .update({
          metadata: { ...(signal.metadata || {}), screening },
        })
        .eq('id', signalId);
    }

    // Persist processing state immediately so page switches do not lose progress.
    const processingStartedAt = new Date().toISOString();
    const processingMetadata = {
      ...(signal.metadata || {}),
      screening,
      quick_discuss: {
        state: 'running',
        started_at: processingStartedAt,
      },
    };

    await supabase
      .from('signals')
      .update({
        status: 'PROCESSING',
        metadata: processingMetadata,
      })
      .eq('id', signalId);

    // --- 2. Run Prepare pipeline (Red/Blue team discussion) ---
    const description = screening.summary || signal.content;
    let prepareResult: PrepareResult;
    try {
      prepareResult = await runPrepare(description, {
        signalId,
        logger: (msg) =>
          console.log(`[quick-discuss][prepare] ${msg}`),
        recordUsage: makeRecordUsage(),
      });
    } catch (e: any) {
      await supabase
        .from('signals')
        .update({
          status: 'DRAFT',
          metadata: {
            ...processingMetadata,
            quick_discuss: {
              state: 'failed',
              started_at: processingStartedAt,
              failed_at: new Date().toISOString(),
              error: e?.message || 'Quick discuss failed',
            },
          },
        })
        .eq('id', signalId);
      throw e;
    }

    // --- 3. Create project from results ---
    const mrdPitch =
      prepareResult.blue_case?.mrd?.executive_pitch || '';
    const projectDescription = [
      mrdPitch || screening.summary,
      prepareResult.business_verdict
        ? `\n---\n${prepareResult.business_verdict}`
        : '',
      `\n---\nAuto-created from ${signal.platform || 'external'} signal (Quick Discuss).`,
      `Relevance score: ${screening.score}/100`,
      `Analysis: ${prepareResult.decision}`,
    ]
      .filter(Boolean)
      .join('\n');

    const { data: project, error: projErr } = await supabase
      .from('projects')
      .insert({
        name: screening.title,
        description: projectDescription,
        status: prepareResult ? 'analyzing' : 'draft',
        signal_id: signalId,
        prepare_result: prepareResult || undefined,
      })
      .select()
      .single();

    if (projErr) {
      console.error('[quick-discuss] Failed to create project:', projErr.message);
    }

    // --- 4. Update signal → ANALYZED with full results ---
    const updatedMetadata = {
      ...(signal.metadata || {}),
      screening,
      prepare_result: prepareResult,
      quick_discuss: {
        state: 'completed',
        started_at: processingStartedAt,
        completed_at: new Date().toISOString(),
      },
      ...(project ? { project_id: project.id } : {}),
    };

    await supabase
      .from('signals')
      .update({ status: 'ANALYZED', metadata: updatedMetadata })
      .eq('id', signalId);

    // --- 5. Return the refreshed signal row ---
    const { data: refreshed } = await supabase
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        signal: refreshed ?? { ...signal, status: 'ANALYZED', metadata: updatedMetadata },
        project: project ?? null,
        prepare_result: prepareResult,
      },
    });
  } catch (e: any) {
    console.error(
      `[API Error] POST /api/signals/${params.signalId}/quick-discuss:`,
      e
    );
    return errorResponse(e.message || 'Internal Server Error');
  }
}
