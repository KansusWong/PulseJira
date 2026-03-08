/**
 * Cron endpoint — batch-processes unprocessed signals through the meta pipeline.
 *
 * POST /api/cron/process-signals
 *
 * Queries the `signals` table for recent DRAFT signals, then feeds them
 * into the meta pipeline (Decision Maker → Architect) for batch processing.
 *
 * Can be called by:
 * - Vercel Cron
 * - External scheduler
 * - Manual trigger
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { runMetaPipeline } from '@/skills/meta-pipeline';
import { recordLlmUsage } from '@/lib/services/usage';

export async function POST(req: Request) {
  // Optional auth check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  assertSupabase();

  let claimedSignalIds: string[] = [];

  try {
    // Query unprocessed signals from the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: signals, error } = await supabase
      .from('signals')
      .select('id, content, source_url, received_at')
      .eq('status', 'DRAFT')
      .gte('received_at', since)
      .order('received_at', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[cron/process-signals] Query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!signals || signals.length === 0) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, message: 'No pending signals' },
      });
    }

    const candidateIds = signals.map((s) => s.id);

    // Claim only still-DRAFT signals to avoid concurrent workers double-processing.
    const { data: claimedSignals, error: claimError } = await supabase
      .from('signals')
      .update({ status: 'PROCESSING' })
      .in('id', candidateIds)
      .eq('status', 'DRAFT')
      .select('id, content, source_url, received_at');

    if (claimError) {
      console.error('[cron/process-signals] Claim error:', claimError);
      return NextResponse.json({ success: false, error: claimError.message }, { status: 500 });
    }

    if (!claimedSignals || claimedSignals.length === 0) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, message: 'No pending signals (already claimed)' },
      });
    }

    claimedSignalIds = claimedSignals.map((s) => s.id);

    const cronRecordUsage = (u: {
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
      }).catch((err) => console.error('[process-signals] Record usage failed:', err));
    };

    // Run meta pipeline with batch signals
    const signalContents = claimedSignals.map((s) => s.content);
    const result = await runMetaPipeline(signalContents, {
      signalIds: claimedSignalIds,
      logger: (msg) => console.log(`[cron/process-signals] ${msg}`),
      recordUsage: cronRecordUsage,
    });

    // Update signal statuses based on result
    const finalStatus = result.decision?.decision === 'PROCEED' ? 'ANALYZED' : 'REJECTED';
    const { error: finalizeError } = await supabase
      .from('signals')
      .update({ status: finalStatus, processed: true })
      .in('id', claimedSignalIds);

    if (finalizeError) {
      console.error('[cron/process-signals] Finalize error:', finalizeError);
      return NextResponse.json({ success: false, error: finalizeError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: claimedSignalIds.length,
        decision: result.decision?.decision || 'SKIPPED',
        confidence: result.decision?.confidence,
        architectSteps: result.architect?.steps_completed || 0,
      },
    });
  } catch (error: any) {
    console.error('[cron/process-signals] Error:', error);

    // Reset in-flight rows so they can be retried by the next cron run.
    if (claimedSignalIds.length > 0) {
      await supabase
        .from('signals')
        .update({ status: 'DRAFT' })
        .in('id', claimedSignalIds)
        .eq('status', 'PROCESSING');
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Support GET for Vercel Cron
export async function GET(req: Request) {
  return POST(req);
}
