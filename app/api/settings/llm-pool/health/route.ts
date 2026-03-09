import { NextResponse } from 'next/server';
import { getLLMPool } from '@/lib/services/llm-pool';
import { listRecentLlmFailoverEvents } from '@/lib/services/llm-failover-events';

/**
 * Lightweight health endpoint for settings polling.
 * Returns runtime status only, without full account/config payload.
 */
export async function GET() {
  try {
    const pool = getLLMPool();
    const recentFailoverEvents = await listRecentLlmFailoverEvents(20);

    return NextResponse.json({
      success: true,
      data: {
        runtimeConfig: pool.getRuntimeConfig(),
        health: pool.getHealthStatus(),
        recentFailoverEvents,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
