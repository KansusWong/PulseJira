import { NextResponse } from 'next/server';
import { updateProjectTask, deleteProjectTask } from '@/projects/project-service';
import { errorResponse } from '@/lib/utils/api-error';

/**
 * PATCH /api/projects/[projectId]/tasks/[taskId] — Update a task
 * DELETE /api/projects/[projectId]/tasks/[taskId] — Delete a task
 */
export async function PATCH(
  req: Request,
  { params }: { params: { projectId: string; taskId: string } }
) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const task = await updateProjectTask(params.taskId, body);
    return NextResponse.json({ success: true, data: task });
  } catch (e: any) {
    console.error(`[API Error] PATCH /api/projects/${params.projectId}/tasks/${params.taskId}:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; taskId: string } }
) {
  try {
    await deleteProjectTask(params.taskId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(`[API Error] DELETE /api/projects/${params.projectId}/tasks/${params.taskId}:`, e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
