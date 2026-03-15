/**
 * PATCH /api/skills/:id/rename
 *
 * Body: { displayName: string }
 * Persists a user-chosen display name for the skill.
 */

import { NextRequest, NextResponse } from 'next/server';
import { setSkillDisplayName } from '@/lib/config/skill-display-names';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const displayName = body?.displayName;

    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'displayName is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    setSkillDisplayName(id, displayName.trim());

    return NextResponse.json({ success: true, displayName: displayName.trim() });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to rename skill' },
      { status: 500 },
    );
  }
}
