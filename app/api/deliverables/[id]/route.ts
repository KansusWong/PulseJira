/**
 * GET /api/deliverables/[id] — fetch deliverable content for a light project.
 *
 * Returns the project metadata plus the last assistant message from its
 * linked conversation as the "deliverable content".
 */

import { NextResponse } from 'next/server';
import { getProject } from '@/projects/project-service';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!supabaseConfigured) {
    return errorResponse('Database not configured', 503);
  }

  const project = await getProject(params.id);
  if (!project) {
    return errorResponse('Project not found', 404);
  }
  if (!project.is_light) {
    return errorResponse('Not a light project', 400);
  }

  let content: string | null = null;
  let contentCreatedAt: string | null = null;

  if (project.conversation_id) {
    const { data } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('conversation_id', project.conversation_id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      content = data.content;
      contentCreatedAt = data.created_at;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      project,
      content,
      content_created_at: contentCreatedAt,
    },
  });
}
