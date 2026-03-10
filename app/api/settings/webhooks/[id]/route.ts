/**
 * PATCH  /api/settings/webhooks/[id] — update a webhook config
 * DELETE /api/settings/webhooks/[id] — delete a webhook config
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { webhookService } from '@/lib/services/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabaseConfigured) {
    return Response.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.active !== undefined) updates.active = body.active;
  if (body.events !== undefined) updates.events = body.events;
  if (body.label !== undefined) updates.label = body.label;
  if (body.webhook_url !== undefined) updates.webhook_url = body.webhook_url;
  if (body.provider !== undefined) updates.provider = body.provider;
  if (body.message_template !== undefined) updates.message_template = body.message_template || null;

  const { data, error } = await supabase
    .from('webhook_configs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  webhookService.invalidateCache();
  return Response.json({ success: true, data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabaseConfigured) {
    return Response.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const { id } = await params;

  const { error } = await supabase
    .from('webhook_configs')
    .delete()
    .eq('id', id);

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  webhookService.invalidateCache();
  return Response.json({ success: true });
}
