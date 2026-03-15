/**
 * GET /api/skills/:id
 *
 * Returns a single skill's full details: metadata, SKILL.md content,
 * and resource file tree.
 *
 * Query params:
 *   ?file=references/doc.md  — returns that single file's content instead.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest, NextResponse } from 'next/server';
import { getSkill, initializeSkillRegistry } from '@/lib/skills/skill-registry';
import { loadSkillFromDir, scanResources, loadResourceContent } from '@/lib/skills/skill-loader';
import { getSkillDisplayName } from '@/lib/config/skill-display-names';

export const runtime = 'nodejs';

function getSkillBaseDirs(): string[] {
  const projectSkills = path.join(process.cwd(), 'skills');
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const codexSkills = path.join(codexHome, 'skills');
  const dirs = [projectSkills];
  if (codexSkills !== projectSkills) dirs.push(codexSkills);
  return dirs;
}

function findSkillDir(id: string): string | null {
  for (const baseDir of getSkillBaseDirs()) {
    const candidate = path.join(baseDir, id);
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch { /* not found */ }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // Ensure registry is initialised
    await initializeSkillRegistry();

    // Try registry first, then fallback to filesystem
    let skill = getSkill(id);
    let skillDir = skill?.localPath ?? findSkillDir(id);

    if (!skill && skillDir) {
      skill = loadSkillFromDir(skillDir, { warnOnInvalid: false }) ?? undefined;
    }

    if (!skill || !skillDir) {
      return NextResponse.json(
        { success: false, error: 'Skill not found' },
        { status: 404 },
      );
    }

    // --- Single file content request ---
    const fileParam = request.nextUrl.searchParams.get('file');
    if (fileParam) {
      // Special case: SKILL.md
      if (fileParam === 'SKILL.md') {
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          return NextResponse.json({ success: true, data: { path: 'SKILL.md', content } });
        } catch {
          return NextResponse.json(
            { success: false, error: 'SKILL.md not found' },
            { status: 404 },
          );
        }
      }

      try {
        const content = loadResourceContent(skillDir, fileParam);
        return NextResponse.json({ success: true, data: { path: fileParam, content } });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err?.message || 'Failed to load resource' },
          { status: 400 },
        );
      }
    }

    // --- Full skill detail ---
    const resources = scanResources(skillDir) ?? { references: [], scripts: [], assets: [] };
    const displayName = getSkillDisplayName(id);

    // Determine source type
    const projectSkillsDir = path.join(process.cwd(), 'skills');
    const isProject = skillDir.startsWith(projectSkillsDir);
    const source = isProject ? 'project' : 'codex';

    return NextResponse.json({
      success: true,
      data: {
        id,
        name: skill.name,
        displayName: displayName || undefined,
        description: skill.description,
        version: skill.version,
        tags: skill.tags,
        source,
        instructions: skill.instructions,
        resources,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to load skill' },
      { status: 500 },
    );
  }
}
