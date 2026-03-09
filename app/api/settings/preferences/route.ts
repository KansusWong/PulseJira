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

export async function GET() {
  try {
    const preferences = await getPreferences();
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
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const { topics, platforms, agentExecutionMode } = body;

    const patch: Record<string, any> = {};
    if (topics !== undefined) patch.topics = topics;
    if (platforms !== undefined) patch.platforms = platforms;
    if (agentExecutionMode !== undefined) patch.agentExecutionMode = agentExecutionMode;

    const updated = await setPreferences(patch);

    return NextResponse.json({ success: true, data: updated });
  } catch (e: any) {
    console.error('[API Error] PUT /api/settings/preferences:', e);
    return errorResponse(e.message || 'Internal Server Error');
  }
}
