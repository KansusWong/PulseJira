import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/connectors/external/supabase';
import { updateSignalStatus } from '@/lib/services/signal';
import { isDemoMode, demoSignalStore, ensureDemoStore } from '@/lib/services/demo-signals';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { parsePagination } from '@/lib/utils/pagination';
import { signalActionSchema } from '@/lib/validations/api-schemas';

/**
 * GET /api/signals — List signals
 * POST /api/signals — Update signal status (approve/reject)
 */
export const GET = withErrorHandler(async (req: Request) => {
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

  const { limit, offset } = parsePagination(req.url, { limit: 50, maxLimit: 200 });

  // Try DB first
  const { data, error, count } = await supabase
    .from('signals')
    .select('id, source_url, content, status, platform, metadata, received_at', { count: 'exact' })
    .order('received_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!error && data && data.length > 0) {
    return NextResponse.json({
      success: true,
      data,
      pagination: { total: count ?? 0, limit, offset },
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
    pagination: { total: 0, limit, offset },
    meta: {
      mode: 'live',
      is_demo: false,
      message: error
        ? 'Signals database unavailable. No demo fallback in live mode.'
        : 'No live signals found yet. Configure sources and run collection.',
    },
  });
});

export const POST = withErrorHandler(async (req: Request) => {
  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const parsed = signalActionSchema.parse(body);

  const statusMap: Record<string, 'DRAFT' | 'ANALYZED' | 'APPROVED' | 'REJECTED'> = {
    approve: 'APPROVED',
    reject: 'REJECTED',
    restore: 'DRAFT',
  };

  const status = statusMap[parsed.action];

  await updateSignalStatus(parsed.signalId, status, parsed.refinedContent);
  return NextResponse.json({ success: true });
});
