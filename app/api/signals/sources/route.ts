/**
 * Signal Sources API — CRUD for automated collection sources.
 *
 * GET  /api/signals/sources       — List all sources
 * POST /api/signals/sources       — Create a new source
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';
import {
  getSignalPlatformDefinition,
  listSignalPlatformsForClient,
} from '@/lib/services/signal-platform-registry';

export async function GET() {
  try {
    assertSupabase();
    const { data, error } = await supabase
      .from('signal_sources')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return errorResponse(error.message, 500);
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        platformCatalog: listSignalPlatformsForClient(),
      },
    });
  } catch (e: any) {
    console.error('[API Error] GET /api/signals/sources:', e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function POST(req: Request) {
  try {
    assertSupabase();
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const { platform, identifier, label, keywords, interval_minutes, active, config } = body;

    if (!platform || !identifier || !label) {
      return errorResponse('platform, identifier, and label are required', 400);
    }

    const definition = getSignalPlatformDefinition(String(platform));
    if (!definition) {
      return errorResponse(
        `Unsupported platform: ${platform}. Add a platform adapter or use generic-web.`,
        400
      );
    }

    const payload: Record<string, any> = {
      platform,
      identifier,
      label,
      keywords: keywords || [],
      interval_minutes: interval_minutes || 60,
      active: active !== false,
    };

    if (config && typeof config === 'object') {
      payload.config = config;
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
  } catch (e: any) {
    console.error('[API Error] POST /api/signals/sources:', e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
