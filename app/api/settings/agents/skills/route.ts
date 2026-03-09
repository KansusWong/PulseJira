import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import { NextResponse } from 'next/server';
import { getAllAgents } from '@/lib/config/agent-registry';
import { getAgentSkillOverrides, upsertAgentSkill } from '@/lib/config/agent-skill-overrides';
import { loadSkillFromDir } from '@/lib/skills/skill-loader';

const exec = promisify(execCb);

export const runtime = 'nodejs';

interface AddSkillPayload {
  mode?: 'reuse' | 'install';
  agentId?: string;
  skillId?: string;
  description?: string;
  installCommand?: string;
  installedSkillIdHint?: string;
}

interface SkillBaseDir {
  dir: string;
  source: 'project' | 'codex';
}

interface SkillCatalogItem {
  id: string;
  description: string;
  source: 'project' | 'codex' | 'registry';
  bound: boolean;
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
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function isExistingDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function collectSkillIds(): Set<string> {
  const ids = new Set<string>();
  for (const base of getSkillBaseDirs()) {
    const entries = readSkillDirEntries(base.dir);
    for (const entry of entries) {
      const skillDir = path.join(base.dir, entry);
      const def = loadSkillFromDir(skillDir, { warnOnInvalid: false });
      if (def) ids.add(entry);
    }
  }
  return ids;
}

function resolveSkillDescription(skillId: string, fallback?: string): string {
  for (const base of getSkillBaseDirs()) {
    const skillDir = path.join(base.dir, skillId);
    const def = loadSkillFromDir(skillDir, { warnOnInvalid: false });
    if (def?.description?.trim()) return def.description.trim();
  }
  const registryDescription = resolveRegistrySkillDescription(skillId);
  if (registryDescription) return registryDescription;
  const normalizedFallback = String(fallback || '').trim();
  return normalizedFallback || `Skill: ${skillId}`;
}

function resolveRegistrySkillDescription(skillId: string): string | null {
  const normalized = sanitizeId(skillId);
  if (!normalized) return null;
  for (const agent of getAllAgents()) {
    for (const skill of agent.skills || []) {
      if (sanitizeId(skill.name) === normalized && String(skill.description || '').trim()) {
        return String(skill.description).trim();
      }
    }
  }
  return null;
}

function listAvailableSkills(agentId?: string): SkillCatalogItem[] {
  const bound = new Set(
    getAgentSkillOverrides(String(agentId || '')).map((s) => sanitizeId(String(s.name || ''))),
  );
  const map = new Map<string, SkillCatalogItem>();

  for (const base of getSkillBaseDirs()) {
    const entries = readSkillDirEntries(base.dir);

    for (const entry of entries) {
      const normalizedId = sanitizeId(entry);
      if (!normalizedId) continue;
      const skillDir = path.join(base.dir, entry);
      const def = loadSkillFromDir(skillDir, { warnOnInvalid: false });
      if (!def) continue;

      if (!map.has(normalizedId)) {
        map.set(normalizedId, {
          id: normalizedId,
          description: def.description || `Skill: ${normalizedId}`,
          source: base.source,
          bound: bound.has(normalizedId),
        });
      }
    }
  }

  // Include skills already registered in agent metadata (built-ins, dynamic registry, etc.).
  for (const agent of getAllAgents()) {
    for (const skill of agent.skills || []) {
      const normalizedId = sanitizeId(skill.name);
      if (!normalizedId) continue;
      if (!map.has(normalizedId)) {
        map.set(normalizedId, {
          id: normalizedId,
          description: String(skill.description || `Skill: ${normalizedId}`),
          source: 'registry',
          bound: bound.has(normalizedId),
        });
      }
    }
  }

  // Ensure already-bound overrides always appear, even if missing from sources above.
  for (const boundId of bound) {
    if (!boundId) continue;
    if (!map.has(boundId)) {
      map.set(boundId, {
        id: boundId,
        description: resolveSkillDescription(boundId),
        source: 'registry',
        bound: true,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.bound !== b.bound) return a.bound ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const agentId = sanitizeId(url.searchParams.get('agentId') || '');
    const skills = listAvailableSkills(agentId || undefined);
    return NextResponse.json({
      success: true,
      data: {
        skills,
        total: skills.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to list skills' }, { status: 500 });
  }
}

function validateInstallCommand(command: string): string | null {
  const trimmed = String(command || '').trim();
  if (!trimmed) return 'installCommand is required';
  if (!/^npx\s+skills\s+add\s+.+/i.test(trimmed)) {
    return 'Only `npx skills add ...` command is allowed';
  }
  if (/[\r\n]/.test(trimmed)) {
    return 'Command must be single-line';
  }
  if (/[;&]|&&|\|\||\$\(|`/.test(trimmed)) {
    return 'Command contains unsupported shell operators';
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AddSkillPayload;
    const mode = body.mode === 'install' ? 'install' : 'reuse';
    const agentId = sanitizeId(String(body.agentId || ''));

    if (!agentId) {
      return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
    }

    const agentDir = path.join(process.cwd(), 'agents', agentId);
    if (!isExistingDirectory(agentDir)) {
      return NextResponse.json(
        { success: false, error: `Agent "${agentId}" does not exist` },
        { status: 400 },
      );
    }

    if (mode === 'reuse') {
      const skillId = sanitizeId(String(body.skillId || ''));
      if (!skillId) {
        return NextResponse.json({ success: false, error: 'skillId is required for reuse mode' }, { status: 400 });
      }
      const description = resolveSkillDescription(skillId, body.description);
      const merged = upsertAgentSkill(agentId, { name: skillId, description });

      return NextResponse.json({
        success: true,
        data: {
          mode,
          agentId,
          boundSkills: merged.map((s) => s.name),
          addedSkill: skillId,
        },
      });
    }

    const command = String(body.installCommand || '').trim();
    const commandError = validateInstallCommand(command);
    if (commandError) {
      return NextResponse.json({ success: false, error: commandError }, { status: 400 });
    }

    const before = collectSkillIds();
    const result = await exec(command, {
      cwd: process.cwd(),
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
    });
    const after = collectSkillIds();

    const installed = Array.from(after).filter((id) => !before.has(id));
    const hint = sanitizeId(String(body.installedSkillIdHint || ''));
    const toBind = installed.length > 0
      ? installed
      : (hint ? [hint] : []);

    if (toBind.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Command executed, but no new skill detected. Provide installedSkillIdHint or use reuse mode.',
        data: {
          stdout: result.stdout?.trim() || '',
          stderr: result.stderr?.trim() || '',
        },
      }, { status: 400 });
    }

    let latest: { name: string; description: string }[] = [];
    for (const skillId of toBind) {
      const description = resolveSkillDescription(skillId, body.description);
      latest = upsertAgentSkill(agentId, { name: skillId, description });
    }

    return NextResponse.json({
      success: true,
      data: {
        mode,
        agentId,
        installCommand: command,
        installedSkills: installed,
        boundSkills: latest.map((s) => s.name),
        stdout: result.stdout?.trim() || '',
        stderr: result.stderr?.trim() || '',
      },
    });
  } catch (e: any) {
    const stderr = String(e?.stderr || '').trim();
    const stdout = String(e?.stdout || '').trim();
    const message = stderr || stdout || e?.message || 'Failed to add skill';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
