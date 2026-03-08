/**
 * Signal Processor — screens new signals, runs full Prepare pipeline for
 * promising ones, and auto-creates projects with rich analysis data.
 *
 * Flow:
 * 1. Fetch unprocessed signals (status = 'DRAFT')
 * 2. Lightweight LLM screening to filter low-quality signals
 * 3. For signals with score >= threshold:
 *    a. Run full Prepare pipeline (Researcher → Blue Team MRD → Critic → Arbitrator)
 *    b. Create project with prepare_result attached
 * 4. Mark signal as 'ANALYZED' or 'REJECTED'
 */

import { supabase } from '../db/client';
import { generateJSON } from '../core/llm';
import { runPrepare, type PrepareResult } from '../skills/prepare';
import { recordLlmUsage } from './usage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessResult {
  processed: number;
  projectsCreated: number;
  rejected: number;
  errors: number;
}

interface SignalRow {
  id: string;
  content: string;
  source_url: string;
  platform: string | null;
  metadata: Record<string, any> | null;
}

interface ScreeningResult {
  relevant: boolean;
  score: number;
  title: string;
  summary: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RELEVANCE_THRESHOLD = Number(process.env.SIGNAL_RELEVANCE_THRESHOLD || '60');
const BATCH_SIZE = Number(process.env.SIGNAL_BATCH_SIZE || '10');

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

// ---------------------------------------------------------------------------
// Usage helper — records token usage for signal-level (pre-project) LLM calls
// ---------------------------------------------------------------------------

function signalRecordUsage(params: {
  agentName: string;
  projectId?: string;
  model?: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}) {
  recordLlmUsage({
    projectId: params.projectId ?? null,
    agentName: params.agentName,
    model: params.model ?? null,
    promptTokens: params.prompt_tokens,
    completionTokens: params.completion_tokens,
  }).catch((err) => console.error('[signal-processor] Record usage failed:', err));
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

async function screenSignal(signal: SignalRow): Promise<ScreeningResult | null> {
  const context = [
    signal.platform ? `[Source: ${signal.platform}]` : '',
    signal.source_url ? `[URL: ${signal.source_url}]` : '',
    '',
    signal.content,
  ].filter(Boolean).join('\n');

  try {
    const result = await generateJSON(SCREENING_PROMPT, context, {
      agentName: 'signal-screener',
    });
    return result as ScreeningResult;
  } catch (error: any) {
    console.error(`[signal-processor] Screening failed for signal ${signal.id}:`, error.message);
    return null;
  }
}

async function runPrepareForSignal(
  signal: SignalRow,
  screening: ScreeningResult
): Promise<PrepareResult | null> {
  const signalDescription = screening.summary || signal.content;
  try {
    const prepareResult = await runPrepare(signalDescription, {
      signalId: signal.id,
      logger: (msg) => console.log(`[signal-processor][prepare] ${msg}`),
      recordUsage: signalRecordUsage,
    });
    return prepareResult;
  } catch (error: any) {
    console.error(`[signal-processor] Prepare pipeline failed for signal ${signal.id}:`, error.message);
    return null;
  }
}

async function createProjectFromSignal(
  signal: SignalRow,
  screening: ScreeningResult,
  prepareResult: PrepareResult | null
): Promise<string | null> {
  const businessVerdict = prepareResult?.business_verdict || '';
  const mrdPitch = prepareResult?.blue_case?.mrd?.executive_pitch || '';
  const description = [
    mrdPitch || screening.summary,
    businessVerdict ? `\n---\n${businessVerdict}` : '',
    `\n---\nAuto-created from ${signal.platform || 'external'} signal.`,
    `Relevance score: ${screening.score}/100`,
    prepareResult ? `Analysis: ${prepareResult.decision}` : '',
  ].filter(Boolean).join('\n');

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: screening.title,
      description,
      status: prepareResult ? 'analyzing' : 'draft',
      signal_id: signal.id,
      prepare_result: prepareResult || undefined,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[signal-processor] Failed to create project:', error.message);
    return null;
  }

  return data.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process unscreened signals: lightweight screen → full Prepare pipeline → create projects.
 */
export async function processNewSignals(): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, projectsCreated: 0, rejected: 0, errors: 0 };

  let hasMore = true;

  while (hasMore) {
    const { data: signals, error } = await supabase
      .from('signals')
      .select('id, content, source_url, platform, metadata')
      .eq('status', 'DRAFT')
      .order('received_at', { ascending: false })
      .limit(BATCH_SIZE);

    if (error || !signals || signals.length === 0) {
      if (error) console.error('[signal-processor] Failed to fetch signals:', error.message);
      break;
    }

    console.log(`[signal-processor] Processing batch of ${signals.length} signals...`);

    for (const signal of signals as SignalRow[]) {
      result.processed++;

      const screening = await screenSignal(signal);

      if (!screening) {
        result.errors++;
        const { error: skipErr } = await supabase
          .from('signals')
          .update({ status: 'ANALYZED' })
          .eq('id', signal.id);
        if (skipErr) console.error(`[signal-processor] Failed to update signal ${signal.id} status:`, skipErr.message);
        continue;
      }

      // Persist screening results immediately so the UI can show scores
      // before the (slow) Prepare pipeline finishes.
      const { error: screenErr } = await supabase
        .from('signals')
        .update({
          metadata: {
            ...(signal.metadata || {}),
            screening,
          },
        })
        .eq('id', signal.id);
      if (screenErr) console.error(`[signal-processor] Failed to persist screening for signal ${signal.id}:`, screenErr.message);

      if (screening.relevant && screening.score >= RELEVANCE_THRESHOLD) {
        console.log(`[signal-processor] Signal ${signal.id} passed screening (${screening.score}). Running Prepare pipeline...`);
        const prepareResult = await runPrepareForSignal(signal, screening);

        const projectId = await createProjectFromSignal(signal, screening, prepareResult);

        if (projectId) {
          result.projectsCreated++;
          const { error: analyzeErr } = await supabase
            .from('signals')
            .update({
              status: 'ANALYZED',
              metadata: {
                ...(signal.metadata || {}),
                screening,
                prepare_result: prepareResult,
                project_id: projectId,
              },
            })
            .eq('id', signal.id);
          if (analyzeErr) console.error(`[signal-processor] Failed to mark signal ${signal.id} as ANALYZED:`, analyzeErr.message);

          console.log(
            `[signal-processor] Created project "${screening.title}" (score: ${screening.score}, decision: ${prepareResult?.decision || 'N/A'}) from signal ${signal.id}`
          );
        } else {
          result.errors++;
        }
      } else {
        result.rejected++;
        const { error: rejectErr } = await supabase
          .from('signals')
          .update({
            status: 'REJECTED',
            metadata: {
              ...(signal.metadata || {}),
              screening,
            },
          })
          .eq('id', signal.id);
        if (rejectErr) console.error(`[signal-processor] Failed to reject signal ${signal.id}:`, rejectErr.message);
      }
    }

    hasMore = signals.length === BATCH_SIZE;
  }

  console.log(
    `[signal-processor] Done: ${result.processed} processed, ${result.projectsCreated} projects, ${result.rejected} rejected, ${result.errors} errors`
  );

  return result;
}
