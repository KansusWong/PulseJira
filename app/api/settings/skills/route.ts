import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAllAgents } from '@/lib/config/agent-registry';
import { getAgentSkillOverrides } from '@/lib/config/agent-skill-overrides';
import { loadSkillFromDir } from '@/lib/skills/skill-loader';

export const runtime = 'nodejs';

// Wrap fs calls to avoid Turbopack TP1004 static-analysis warnings
const _statSync = fs.statSync.bind(fs);
const _readdirSync = fs.readdirSync.bind(fs);

interface SkillBaseDir {
  dir: string;
  source: 'project' | 'codex';
}

interface SkillCatalogItem {
  id: string;
  description: string;
  source: 'project' | 'codex' | 'registry';
  bound: boolean;
  enabled: boolean;
}

function sanitizeId(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getSkillBaseDirs(): SkillBaseDir[] {
  const projectSkills = path.join(process.cwd(), 'skills');
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const codexSkills = path.join(codexHome, 'skills');

  if (projectSkills === codexSkills) {
    return [{ dir: projectSkills, source: 'project' }];
  }

  return [
    { dir: projectSkills, source: 'project' },
    { dir: codexSkills, source: 'codex' },
  ];
}

function readSkillDirEntries(dir: string): string[] {
  try {
    return _readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * GET /api/settings/skills?agentId=xxx
 *
 * Returns all available skills with bound/enabled status relative to the given agent.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const agentId = sanitizeId(url.searchParams.get('agentId') || '');

    const overrides = getAgentSkillOverrides(String(agentId || ''));

    // Pass 1: Scan filesystem to build SKILL.md name → directory slug mapping
    const nameToSlug = new Map<string, string>();
    const skillEntries: Array<{ slug: string; def: ReturnType<typeof loadSkillFromDir>; source: SkillBaseDir['source'] }> = [];

    for (const base of getSkillBaseDirs()) {
      const entries = readSkillDirEntries(base.dir);

      for (const entry of entries) {
        const slug = sanitizeId(entry);
        if (!slug) continue;
        const skillDir = path.join(base.dir, entry);
        try {
          if (!_statSync(skillDir).isDirectory()) continue;
        } catch {
          continue;
        }
        const def = loadSkillFromDir(skillDir, { warnOnInvalid: false });
        if (!def) continue;

        // Map both directory slug and SKILL.md name to canonical slug
        nameToSlug.set(slug, slug);
        const skillName = String(def.name || '').trim();
        if (skillName && skillName !== slug) {
          nameToSlug.set(skillName, slug);
        }

        skillEntries.push({ slug, def, source: base.source });
      }
    }

    // Build bound map, resolving override names (which may be SKILL.md names
    // or directory slugs) to canonical directory slugs
    const boundMap = new Map<string, (typeof overrides)[0]>();
    for (const s of overrides) {
      const rawName = String(s.name || '').trim();
      const resolvedSlug = nameToSlug.get(rawName) || sanitizeId(rawName);
      if (resolvedSlug) {
        boundMap.set(resolvedSlug, s);
      }
    }

    // Pass 2: Build catalog from filesystem entries
    const map = new Map<string, SkillCatalogItem>();

    for (const { slug, def, source } of skillEntries) {
      if (map.has(slug)) continue;
      const override = boundMap.get(slug);
      map.set(slug, {
        id: slug,
        description: def!.description || `Skill: ${slug}`,
        source,
        bound: !!override,
        enabled: override ? override.enabled !== false : true,
      });
    }

    // Include skills from agent metadata (built-ins, dynamic registry)
    for (const agent of getAllAgents()) {
      for (const skill of agent.skills || []) {
        const normalizedId = sanitizeId(skill.name);
        if (!normalizedId) continue;
        if (!map.has(normalizedId)) {
          const override = boundMap.get(normalizedId);
          map.set(normalizedId, {
            id: normalizedId,
            description: String(skill.description || `Skill: ${normalizedId}`),
            source: 'registry',
            bound: !!override,
            enabled: override ? override.enabled !== false : true,
          });
        }
      }
    }

    // Ensure already-bound overrides always appear (orphan entries)
    for (const [boundId, override] of boundMap) {
      if (!boundId) continue;
      if (!map.has(boundId)) {
        map.set(boundId, {
          id: boundId,
          description: String(override.description || `Skill: ${boundId}`),
          source: 'registry',
          bound: true,
          enabled: override.enabled !== false,
        });
      }
    }

    const skills = Array.from(map.values()).sort((a, b) => {
      if (a.bound !== b.bound) return a.bound ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    return NextResponse.json({
      success: true,
      data: {
        skills,
        total: skills.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to list skills' },
      { status: 500 },
    );
  }
}
