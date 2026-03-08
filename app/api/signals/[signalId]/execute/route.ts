/**
 * POST /api/signals/[signalId]/execute
 *
 * Bridges the Signal → Execution pipeline.
 * Takes a PROCEED-analyzed signal, extracts StructuredRequirements from its
 * prepare_result MRD, creates a conversation linked to the existing project,
 * and returns everything the frontend needs to launch the L3 DM → Architect flow.
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';
import type { StructuredRequirements } from '@/lib/core/types';

export async function POST(
  _req: Request,
  { params }: { params: { signalId: string } },
) {
  try {
    assertSupabase();

    const { signalId } = params;

    // 1. Load signal
    const { data: signal, error: fetchErr } = await supabase
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .single();

    if (fetchErr || !signal) {
      return errorResponse('Signal not found', 404);
    }

    // 2. Idempotency: if already executed, return existing conversation
    const existingConvId = signal.metadata?.execute_conversation_id;
    if (existingConvId) {
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id, project_id, structured_requirements')
        .eq('id', existingConvId)
        .single();

      if (existingConv) {
        return NextResponse.json({
          success: true,
          data: {
            conversation_id: existingConv.id,
            project_id: existingConv.project_id,
            requirements: existingConv.structured_requirements,
          },
        });
      }
    }

    // 3. Validate preconditions
    const meta = signal.metadata || {};
    const prepareResult = meta.prepare_result;

    if (signal.status !== 'ANALYZED') {
      return errorResponse('Signal must be in ANALYZED status', 400);
    }
    if (prepareResult?.decision !== 'PROCEED') {
      return errorResponse('Signal decision must be PROCEED', 400);
    }
    if (!meta.project_id) {
      return errorResponse('Signal has no associated project', 400);
    }

    // 4. Extract StructuredRequirements from MRD
    const mrd = prepareResult.blue_case?.mrd || {};
    const screening = meta.screening || {};

    const requirements: StructuredRequirements = {
      summary: mrd.executive_pitch || prepareResult.summary || '',
      goals: mrd.success_metrics || [],
      scope: [
        mrd.market_overview?.market_size,
        mrd.market_overview?.growth_trend,
        ...(mrd.market_overview?.key_drivers || []),
      ]
        .filter(Boolean)
        .join('; '),
      constraints: prepareResult.red_case?.risks || [],
      suggested_name: screening.title || 'signal-project',
    };

    // 5. Create conversation linked to existing project
    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .insert({
        status: 'active',
        project_id: meta.project_id,
        complexity_assessment: {
          complexity_level: 'L3',
          execution_mode: 'agent_team',
          confidence: 0.9,
          reasoning: 'Signal pipeline — auto-routed to L3 agent team',
        },
        execution_mode: 'agent_team',
        structured_requirements: requirements,
        title: screening.title || 'Signal Execution',
      })
      .select('id')
      .single();

    if (convErr || !conversation) {
      console.error('[execute] Failed to create conversation:', convErr);
      return errorResponse('Failed to create conversation', 500);
    }

    // 6. Update signal metadata with execute_conversation_id
    await supabase
      .from('signals')
      .update({
        metadata: {
          ...meta,
          execute_conversation_id: conversation.id,
        },
      })
      .eq('id', signalId);

    return NextResponse.json({
      success: true,
      data: {
        conversation_id: conversation.id,
        project_id: meta.project_id,
        requirements,
      },
    });
  } catch (err: any) {
    console.error('[execute] Error:', err);
    return errorResponse(err.message || 'Internal server error', 500);
  }
}
