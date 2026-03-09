/**
 * POST /api/projects/[projectId]/promote
 *
 * Promote a project feature to a system-level Skill or Agent.
 */

import { NextResponse } from 'next/server';
import { PromoteFeatureTool } from '@/lib/tools/promote-feature';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } },
) {
  const body = await req.json();
  const { feature_description, feature_type, feature_name } = body;

  if (!feature_description || !feature_type || !feature_name) {
    return NextResponse.json(
      { success: false, error: 'feature_description, feature_type, and feature_name are required' },
      { status: 400 },
    );
  }

  const tool = new PromoteFeatureTool();
  const result = await tool.execute({
    project_id: params.projectId,
    feature_description,
    feature_type,
    feature_name,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
