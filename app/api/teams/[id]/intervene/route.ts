/**
 * POST /api/teams/[id]/intervene — user intervention in team execution
 */

import { NextResponse } from 'next/server';
import { supabaseConfigured } from '@/lib/db/client';
import { teamCoordinator } from '@/lib/services/team-coordinator';
import type { UserIntervention } from '@/lib/core/types';

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body: UserIntervention = await req.json();
    await teamCoordinator.intervene(params.id, body);
    return NextResponse.json({ success: true, data: { status: 'intervention_recorded' } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
