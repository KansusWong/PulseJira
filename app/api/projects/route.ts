import { NextResponse } from 'next/server';
import { listProjects, createProject } from '@/projects/project-service';
import { errorResponse } from '@/lib/utils/api-error';

/**
 * GET /api/projects — List all projects
 * POST /api/projects — Create a new project
 */
export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({ success: true, data: projects });
  } catch (e: any) {
    console.error('[API Error] GET /api/projects:', e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const { name, description } = body;
    if (!name || !description) {
      return errorResponse('name and description are required', 400);
    }

    const project = await createProject({ name, description, urls: body.urls });
    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (e: any) {
    console.error('[API Error] POST /api/projects:', e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
