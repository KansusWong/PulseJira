/**
 * GET  /api/settings/webhooks — list all webhook configs
 * POST /api/settings/webhooks — create a new webhook config
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { webhookService } from '@/lib/services/webhook';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { parsePagination } from '@/lib/utils/pagination';
import { createWebhookSchema } from '@/lib/validations/api-schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: true, data: [], pagination: { total: 0, limit: 50, offset: 0 } });
  }

  const { limit, offset } = parsePagination(req.url);

  const { data, error, count } = await supabase
    .from('webhook_configs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data, pagination: { total: count ?? 0, limit, offset } });
});

export const POST = withErrorHandler(async (req: Request) => {
  if (!supabaseConfigured) {
    return errorResponse('Database not configured', 503);
  }

  const body = await req.json();
  const parsed = createWebhookSchema.parse(body);

  const { data, error } = await supabase
    .from('webhook_configs')
    .insert({
      provider: parsed.provider,
      label: parsed.label,
      webhook_url: parsed.webhook_url,
      events: parsed.events,
      message_template: parsed.message_template,
      display_name: parsed.display_name,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  webhookService.invalidateCache();
  return NextResponse.json({ success: true, data });
});
