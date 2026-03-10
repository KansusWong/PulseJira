/**
 * Signal Sources API — CRUD for automated collection sources.
 *
 * GET  /api/signals/sources       — List all sources
 * POST /api/signals/sources       — Create a new source
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { parsePagination } from '@/lib/utils/pagination';
import { createSignalSourceSchema } from '@/lib/validations/api-schemas';
import {
  getSignalPlatformDefinition,
  listSignalPlatformsForClient,
} from '@/lib/services/signal-platform-registry';

export const GET = withErrorHandler(async (req: Request) => {
  assertSupabase();

  const { limit, offset } = parsePagination(req.url);

  const { data, error, count } = await supabase
    .from('signal_sources')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({
    success: true,
    data,
    pagination: { total: count ?? 0, limit, offset },
    meta: {
      platformCatalog: listSignalPlatformsForClient(),
    },
  });
});

export const POST = withErrorHandler(async (req: Request) => {
  assertSupabase();

  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const parsed = createSignalSourceSchema.parse(body);

  const definition = getSignalPlatformDefinition(parsed.platform);
  if (!definition) {
    return errorResponse(
      `Unsupported platform: ${parsed.platform}. Add a platform adapter or use generic-web.`,
      400
    );
  }

  const payload: Record<string, unknown> = {
    platform: parsed.platform,
    identifier: parsed.identifier,
    label: parsed.label,
    keywords: parsed.keywords,
    interval_minutes: parsed.interval_minutes,
    active: parsed.active,
  };

  if (parsed.config && typeof parsed.config === 'object') {
    payload.config = parsed.config;
  }

  const { data, error } = await supabase
    .from('signal_sources')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
});
