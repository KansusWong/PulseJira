/**
 * Signal Source by ID — update, delete, or manually trigger collection.
 *
 * PATCH  /api/signals/sources/[sourceId]  — Update source config
 * DELETE /api/signals/sources/[sourceId]  — Delete source
 * POST   /api/signals/sources/[sourceId]  — Manually trigger collection for this source
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { collectFromSource } from '@/lib/services/signal-collector';
import { errorResponse } from '@/lib/utils/api-error';

export async function PATCH(
  req: Request,
  { params }: { params: { sourceId: string } }
) {
  try {
    assertSupabase();
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const allowed = ['label', 'keywords', 'interval_minutes', 'active', 'identifier', 'config'];
    const updates: Record<string, any> = {};

    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse('No valid fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('signal_sources')
      .update(updates)
      .eq('id', params.sourceId)
      .select()
      .single();

    if (error) {
      return errorResponse(error.message, 500);
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error(`[API Error] PATCH /api/signals/sources/${params.sourceId}:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { sourceId: string } }
) {
  try {
    assertSupabase();
    // Preserve collected signals while deleting the source:
    // clear FK references first to avoid constraint violations.
    const { error: detachError } = await supabase
      .from('signals')
      .update({ source_id: null })
      .eq('source_id', params.sourceId);

    if (detachError) {
      return errorResponse(detachError.message, 500);
    }

    const { error } = await supabase
      .from('signal_sources')
      .delete()
      .eq('id', params.sourceId);

    if (error) {
      return errorResponse(error.message, 500);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(`[API Error] DELETE /api/signals/sources/${params.sourceId}:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { sourceId: string } }
) {
  try {
    assertSupabase();
    const result = await collectFromSource(params.sourceId);
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    console.error(`[API Error] POST /api/signals/sources/${params.sourceId}:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
