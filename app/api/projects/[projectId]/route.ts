import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject } from '@/projects/project-service';
import { errorResponse } from '@/lib/utils/api-error';

/**
 * GET /api/projects/[projectId] — Get project details
 * PATCH /api/projects/[projectId] — Update project
 * DELETE /api/projects/[projectId] — Delete project
 */
export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const project = await getProject(params.projectId);
    if (!project) {
      return errorResponse('Project not found', 404);
    }
    return NextResponse.json({ success: true, data: project });
  } catch (e: any) {
    console.error(`[API Error] GET /api/projects/${params.projectId}:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const project = await updateProject(params.projectId, body);
    return NextResponse.json({ success: true, data: project });
  } catch (e: any) {
    console.error(`[API Error] PATCH /api/projects/${params.projectId}:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    await deleteProject(params.projectId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(`[API Error] DELETE /api/projects/${params.projectId}:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
