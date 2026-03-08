/**
 * GET /api/conversations/[id]/approvals — list tool approval audit history
 */

import { NextResponse } from 'next/server';
import { listToolApprovalAudits } from '@/lib/services/tool-approval-audit';

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  const audits = await listToolApprovalAudits(params.id, limit);

  return NextResponse.json({ success: true, data: audits });
}
