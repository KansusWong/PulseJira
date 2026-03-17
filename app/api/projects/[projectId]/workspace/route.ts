/**
 * GET /api/projects/[projectId]/workspace — Return workspace info for a project.
 *
 * Used by the frontend to display the local workspace path after implementation.
 */

import { NextResponse } from 'next/server';
import path from 'path';
import { pathExists } from '@/lib/utils/fs-helpers';
import { supabase, assertSupabase } from '@/lib/db/client';
import { errorResponse } from '@/lib/utils/api-error';

export async function GET(
  _req: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    assertSupabase();
    const projectId = params.projectId;

    const { data: project, error } = await supabase
      .from('projects')
      .select('name, workspace_id')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      return errorResponse('Project not found', 404);
    }

    const dirName = (project.name || `project-${projectId}`)
      .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_');
    const localPath = path.join(process.cwd(), 'projects', dirName);
    const exists = pathExists(localPath);

    return NextResponse.json({
      success: true,
      data: {
        localPath: exists ? `projects/${dirName}` : null,
        absolutePath: exists ? localPath : null,
        workspaceId: project.workspace_id || null,
      },
    });
  } catch (e: any) {
    console.error(`[API Error] GET /api/projects/${params.projectId}/workspace:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
