/**
 * User Preferences API — manages signal collection preferences.
 *
 * GET  /api/settings/preferences  — Return current preferences + platform availability
 * PUT  /api/settings/preferences  — Update preferences
 */

import { NextResponse } from 'next/server';
import {
  getPreferences,
  setPreferences,
  getAvailablePlatforms,
} from '@/lib/services/preferences-store';
import { listSignalPlatformsForClient } from '@/lib/services/signal-platform-registry';
import { errorResponse } from '@/lib/utils/api-error';
import { getAuthContext } from '@/lib/auth';

export async function GET() {
  try {
    const auth = getAuthContext();
    const preferences = auth.userId && auth.orgId
      ? await getPreferences(auth.userId, auth.orgId)
      : await getPreferences();
    const availablePlatforms = getAvailablePlatforms();
    const platformCatalog = listSignalPlatformsForClient();

    return NextResponse.json({
      success: true,
      data: {
        preferences,
        availablePlatforms,
        platformCatalog,
      },
    });
  } catch (e: any) {
    console.error('[API Error] GET /api/settings/preferences:', e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}

export async function PUT(req: Request) {
  try {
    const auth = getAuthContext();
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const { topics, platforms, agentExecutionMode, trustLevel } = body;

    const patch: Record<string, any> = {};
    if (topics !== undefined) patch.topics = topics;
    if (platforms !== undefined) patch.platforms = platforms;
    if (agentExecutionMode !== undefined) patch.agentExecutionMode = agentExecutionMode;
    if (trustLevel !== undefined) patch.trustLevel = trustLevel;

    const updated = auth.userId && auth.orgId
      ? await setPreferences(patch, auth.userId, auth.orgId)
      : await setPreferences(patch);

    return NextResponse.json({ success: true, data: updated });
  } catch (e: any) {
    console.error('[API Error] PUT /api/settings/preferences:', e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
