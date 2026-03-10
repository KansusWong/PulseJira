/**
 * POST /api/teams — create a new agent team
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { createTeamSchema } from '@/lib/validations/api-schemas';

export const POST = withErrorHandler(async (req: Request) => {
  if (!supabaseConfigured) {
    return errorResponse('Database not configured', 503);
  }

  const body = await req.json();
  const parsed = createTeamSchema.parse(body);

  const { data, error } = await supabase
    .from('agent_teams')
    .insert({
      conversation_id: parsed.conversation_id || null,
      project_id: parsed.project_id || null,
      team_name: parsed.team_name,
      lead_agent: parsed.lead_agent,
      status: 'forming',
      config: parsed.config || null,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, data });
});
