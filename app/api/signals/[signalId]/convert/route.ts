/**
 * POST /api/signals/[signalId]/convert — Convert a signal into a project.
 *
 * Optionally accepts: { name?, description? } to override auto-generated values.
 * Returns the created project.
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';

export async function POST(
  req: Request,
  { params }: { params: { signalId: string } }
) {
  try {
    assertSupabase();
    const signalId = params.signalId;

    // Fetch signal
    const { data: signal, error: sigErr } = await supabase
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .single();

    if (sigErr || !signal) {
      return errorResponse('Signal not found', 404);
    }

    // Parse optional overrides
    let overrides: { name?: string; description?: string } = {};
    try {
      overrides = await req.json();
    } catch {
      // No body is fine
    }

    // Derive project name/description from screening or content
    const screening = signal.metadata?.screening;
    const name = overrides.name
      || screening?.title
      || signal.content?.slice(0, 60)
      || 'Untitled Signal';

    const description = overrides.description
      || [
          screening?.summary || signal.content?.slice(0, 200),
          '',
          `---`,
          `Source: ${signal.platform || 'unknown'}`,
          signal.source_url ? `URL: ${signal.source_url}` : '',
          screening?.score ? `Relevance: ${screening.score}/100` : '',
          screening?.reason || '',
        ].filter(Boolean).join('\n');

    // Create project
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .insert({
        name,
        description,
        status: 'draft',
        signal_id: signalId,
      })
      .select()
      .single();

    if (projErr) {
      return errorResponse(projErr.message, 500);
    }

    // Mark signal as approved
    await supabase
      .from('signals')
      .update({
        status: 'APPROVED',
        metadata: {
          ...(signal.metadata || {}),
          project_id: project.id,
          converted_at: new Date().toISOString(),
        },
      })
      .eq('id', signalId);

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (e: any) {
    console.error(`[API Error] POST /api/signals/${params.signalId}/convert:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
