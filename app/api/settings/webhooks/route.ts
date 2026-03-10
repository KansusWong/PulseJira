/**
 * GET  /api/settings/webhooks — list all webhook configs
 * POST /api/settings/webhooks — create a new webhook config
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { webhookService } from '@/lib/services/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!supabaseConfigured) {
    return Response.json({ success: true, data: [] });
  }

  const { data, error } = await supabase
    .from('webhook_configs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, data });
}

export async function POST(req: Request) {
  if (!supabaseConfigured) {
    return Response.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { provider, label, webhook_url, events, message_template } = body;

  if (!provider || !webhook_url) {
    return Response.json({ success: false, error: 'provider and webhook_url are required' }, { status: 400 });
  }

  const validProviders = ['feishu', 'dingtalk', 'slack', 'wecom', 'custom'];
  if (!validProviders.includes(provider)) {
    return Response.json({ success: false, error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('webhook_configs')
    .insert({
      provider,
      label: label || '',
      webhook_url,
      events: events || ['pipeline_complete', 'deploy_complete', 'deploy_failed'],
      message_template: message_template || null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  webhookService.invalidateCache();
  return Response.json({ success: true, data });
}
