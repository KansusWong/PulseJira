/**
 * GET   /api/settings/system-config — get system configuration
 * PATCH /api/settings/system-config — update system configuration
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { systemConfigPatchSchema } from '@/lib/validations/api-schemas';

const ALLOWED_CONFIG_KEYS = new Set([
  'signal_collection_enabled',
  'signal_fetch_interval_hours',
  'signal_max_per_platform',
  'auto_process_signals',
  'signal_last_collected_at',
]);

export const GET = withErrorHandler(async () => {
  if (!supabaseConfigured) {
    return NextResponse.json({
      success: true,
      data: {
        signal_collection_enabled: true,
        signal_fetch_interval_hours: 5,
        signal_max_per_platform: 5,
      },
    });
  }

  const { data, error } = await supabase
    .from('system_config')
    .select('*')
    .limit(100);

  if (error) {
    return errorResponse(error.message, 500);
  }

  // Transform array of {key, value} into a config object
  const config: Record<string, unknown> = {};
  for (const row of data || []) {
    try {
      config[row.key] = JSON.parse(row.value);
    } catch {
      config[row.key] = row.value;
    }
  }

  return NextResponse.json({ success: true, data: config });
});

export const PATCH = withErrorHandler(async (req: Request) => {
  if (!supabaseConfigured) {
    return errorResponse('Database not configured', 503);
  }

  const body = await req.json();
  const parsed = systemConfigPatchSchema.parse(body);

  // Validate keys against whitelist
  const invalidKeys = Object.keys(parsed).filter(k => !ALLOWED_CONFIG_KEYS.has(k));
  if (invalidKeys.length > 0) {
    return errorResponse(`Invalid config keys: ${invalidKeys.join(', ')}`, 400);
  }

  // Upsert each key-value pair
  const updates = Object.entries(parsed).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
    updated_at: new Date().toISOString(),
  }));

  for (const update of updates) {
    await supabase
      .from('system_config')
      .upsert(update, { onConflict: 'key' });
  }

  return NextResponse.json({ success: true, data: parsed });
});
