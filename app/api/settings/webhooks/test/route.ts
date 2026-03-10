/**
 * POST /api/settings/webhooks/test — send a test webhook notification
 *
 * Body: { webhook_id: string } or { provider: string, webhook_url: string }
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { webhookService } from '@/lib/services/webhook';
import type { WebhookProvider } from '@/lib/services/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json();

  let provider: WebhookProvider;
  let webhookUrl: string;
  let messageTemplate: string | null = null;
  let displayName: string | null = null;

  if (body.webhook_id) {
    // Load config from DB
    if (!supabaseConfigured) {
      return Response.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    const { data, error } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('id', body.webhook_id)
      .single();

    if (error || !data) {
      return Response.json({ success: false, error: 'Webhook config not found' }, { status: 404 });
    }

    provider = data.provider as WebhookProvider;
    webhookUrl = data.webhook_url;
    messageTemplate = data.message_template ?? null;
    displayName = data.display_name ?? null;
  } else if (body.provider && body.webhook_url) {
    provider = body.provider as WebhookProvider;
    webhookUrl = body.webhook_url;
    messageTemplate = body.message_template ?? null;
    displayName = body.display_name ?? null;
  } else {
    return Response.json(
      { success: false, error: 'Provide webhook_id or (provider + webhook_url)' },
      { status: 400 },
    );
  }

  const result = await webhookService.sendTest({ provider, webhook_url: webhookUrl, message_template: messageTemplate, display_name: displayName });

  if (result.ok) {
    return Response.json({ success: true, message: 'Test message sent' });
  }

  return Response.json(
    { success: false, error: result.error || `HTTP ${result.status}` },
    { status: 502 },
  );
}
