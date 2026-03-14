/**
 * GET /api/assets
 *
 * Aggregated assets API — returns skills, PPTs, and other files.
 * - skills: from SkillRegistry filesystem scan (reuses /api/settings/skills logic)
 * - ppts: from code_artifacts table WHERE file_path LIKE '%.pptx'
 * - files: from code_artifacts table WHERE file_path NOT LIKE '%.pptx'
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { loadSkillFromDir } from '@/lib/skills/skill-loader';

export const runtime = 'nodejs';

const _statSync = fs.statSync.bind(fs);
const _readdirSync = fs.readdirSync.bind(fs);

interface SkillAsset {
  id: string;
  name: string;
  description: string;
  created_at: string | null;
}

interface FileAsset {
  id: string;
  name: string;
  file_path: string;
  type: string;
  project_id: string | null;
  created_at: string;
}

function getSkillBaseDirs(): string[] {
  const projectSkills = path.join(process.cwd(), 'skills');
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const codexSkills = path.join(codexHome, 'skills');
  const dirs = [projectSkills];
  if (codexSkills !== projectSkills) dirs.push(codexSkills);
  return dirs;
}

export async function GET() {
  try {
    // --- Skills ---
    const skills: SkillAsset[] = [];
    for (const baseDir of getSkillBaseDirs()) {
      let entries: string[];
      try {
        entries = _readdirSync(baseDir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const skillDir = path.join(baseDir, entry);
        try {
          if (!_statSync(skillDir).isDirectory()) continue;
        } catch {
          continue;
        }
        const def = loadSkillFromDir(skillDir, { warnOnInvalid: false });
        if (!def) continue;

        let createdAt: string | null = null;
        try {
          const stat = _statSync(skillDir);
          createdAt = stat.birthtime?.toISOString() || stat.mtime?.toISOString() || null;
        } catch { /* ignore */ }

        skills.push({
          id: entry,
          name: def.name || entry,
          description: def.description || '',
          created_at: createdAt,
        });
      }
    }

    // --- PPTs and Files from code_artifacts ---
    const ppts: FileAsset[] = [];
    const files: FileAsset[] = [];

    if (supabaseConfigured) {
      const { data: artifacts } = await supabase
        .from('code_artifacts')
        .select('id, file_path, type, task_id, metadata, created_at')
        .not('file_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (artifacts) {
        for (const a of artifacts) {
          const filePath = a.file_path || '';
          const fileName = filePath.split('/').pop() || filePath;
          const ext = path.extname(fileName).toLowerCase();

          const asset: FileAsset = {
            id: a.id,
            name: fileName,
            file_path: filePath,
            type: ext.replace('.', '') || a.type || 'unknown',
            project_id: a.task_id || null,
            created_at: a.created_at,
          };

          if (ext === '.pptx' || ext === '.ppt') {
            ppts.push(asset);
          } else {
            files.push(asset);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { skills, ppts, files },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to load assets' },
      { status: 500 },
    );
  }
}
