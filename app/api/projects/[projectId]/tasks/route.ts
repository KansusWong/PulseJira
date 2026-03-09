import { NextResponse } from 'next/server';
import { getProjectTasks, createProjectTask } from '@/projects/project-service';
import { errorResponse } from '@/lib/utils/api-error';

/**
 * GET /api/projects/[projectId]/tasks — List tasks for a project
 * POST /api/projects/[projectId]/tasks — Create a task for a project
 */
export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const tasks = await getProjectTasks(params.projectId);
    return NextResponse.json({ success: true, data: tasks });
  } catch (e: any) {
    console.error(`[API Error] GET /api/projects/${params.projectId}/tasks:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function POST(
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

    const { title, description, status = 'todo', type = 'feature', priority = 'medium', affected_files } = body;
    if (!title) {
      return errorResponse('title is required', 400);
    }

    const task = await createProjectTask(params.projectId, {
      title,
      description,
      status,
      type,
      priority,
      affected_files,
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (e: any) {
    console.error(`[API Error] POST /api/projects/${params.projectId}/tasks:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
