import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/connectors/external/supabase';
import { updateSignalStatus } from '@/lib/services/signal';
import { isDemoMode, demoSignalStore, ensureDemoStore } from '@/lib/services/demo-signals';

/**
 * GET /api/signals — List signals
 * POST /api/signals — Update signal status (approve/reject)
 */
export async function GET() {
  const demoMode = isDemoMode();

  // Skip pointless placeholder query when Supabase is not configured
  if (!supabaseConfigured) {
    if (demoMode) {
      ensureDemoStore(6);
      return NextResponse.json({
        success: true,
        data: demoSignalStore,
        meta: { mode: 'demo', is_demo: true, message: 'Database not configured. Showing demo signals.' },
      });
    }
    return NextResponse.json({
      success: true,
      data: [],
      meta: { mode: 'live', is_demo: false, message: 'Supabase not configured. No signals available.' },
    });
  }

  // Try DB first
  const { data, error } = await supabase
    .from('signals')
    .select('id, source_url, content, status, platform, metadata, received_at')
    .order('received_at', { ascending: false })
    .limit(50);

  if (!error && data && data.length > 0) {
    return NextResponse.json({
      success: true,
      data,
      meta: {
        mode: 'live',
        is_demo: false,
      },
    });
  }

  // Demo mode only: explicit mock-data response so UI can label it.
  if (demoMode) {
    ensureDemoStore(6);
    return NextResponse.json({
      success: true,
      data: demoSignalStore,
      meta: {
        mode: 'demo',
        is_demo: true,
        message: error
          ? 'Database unavailable. Showing demo signals.'
          : 'Demo mode is enabled. Showing mock signals.',
      },
    });
  }

  // Live mode: never mix in demo data.
  return NextResponse.json({
    success: true,
    data: [],
    meta: {
      mode: 'live',
      is_demo: false,
      message: error
        ? 'Signals database unavailable. No demo fallback in live mode.'
        : 'No live signals found yet. Configure sources and run collection.',
    },
  });
}

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { signalId, action, refinedContent } = body;
  if (!signalId || !action) {
    return NextResponse.json({ success: false, error: 'signalId and action are required' }, { status: 400 });
  }

  const statusMap: Record<string, 'DRAFT' | 'ANALYZED' | 'APPROVED' | 'REJECTED'> = {
    approve: 'APPROVED',
    reject: 'REJECTED',
    restore: 'DRAFT',
  };

  const status = statusMap[action];
  if (!status) {
    return NextResponse.json({ success: false, error: 'action must be approve, reject, or restore' }, { status: 400 });
  }

  try {
    await updateSignalStatus(signalId, status, refinedContent);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
