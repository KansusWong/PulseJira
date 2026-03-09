/**
 * GET   /api/settings/system-config — get system configuration
 * PATCH /api/settings/system-config — update system configuration
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export async function GET() {
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
    .select('*');

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Transform array of {key, value} into a config object
  const config: Record<string, any> = {};
  for (const row of data || []) {
    try {
      config[row.key] = JSON.parse(row.value);
    } catch {
      config[row.key] = row.value;
    }
  }

  return NextResponse.json({ success: true, data: config });
}

export async function PATCH(req: Request) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  const body = await req.json();

  // Upsert each key-value pair
  const updates = Object.entries(body).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
    updated_at: new Date().toISOString(),
  }));

  for (const update of updates) {
    await supabase
      .from('system_config')
      .upsert(update, { onConflict: 'key' });
  }

  return NextResponse.json({ success: true, data: body });
}
