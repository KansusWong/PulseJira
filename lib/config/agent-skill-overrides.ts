import fs from 'fs';
import path from 'path';

export interface AgentSkillMeta {
  name: string;
  description: string;
  enabled?: boolean; // defaults to true when undefined
}

interface AgentSkillOverrideEntry {
  skills: AgentSkillMeta[];
}

type AgentSkillOverrideMap = Record<string, AgentSkillOverrideEntry>;

const OVERRIDES_PATH = path.join(process.cwd(), 'agents', 'agent-skill-overrides.json');

function readOverridesFile(): AgentSkillOverrideMap {
  try {
    if (fs.existsSync(OVERRIDES_PATH)) {
      const raw = fs.readFileSync(OVERRIDES_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as AgentSkillOverrideMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch (e) {
    console.warn('[agent-skill-overrides] Failed to read overrides:', e);
  }
  return {};
}

function writeOverridesFile(overrides: AgentSkillOverrideMap): void {
  const dir = path.dirname(OVERRIDES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf-8');
}

function normalizeSkillName(name: string): string {
  return name.trim();
}

function dedupeSkills(skills: AgentSkillMeta[]): AgentSkillMeta[] {
  const merged = new Map<string, AgentSkillMeta>();

  for (const skill of skills) {
    const normalizedName = normalizeSkillName(skill.name);
    if (!normalizedName) continue;
    const entry: AgentSkillMeta = {
      name: normalizedName,
      description: String(skill.description || '').trim(),
    };
    if (skill.enabled === false) entry.enabled = false;
    merged.set(normalizedName, entry);
  }

  return Array.from(merged.values());
}

export function getAgentSkillOverrides(agentId: string): AgentSkillMeta[] {
  const all = readOverridesFile();
  const entry = all[agentId];
  if (!entry || !Array.isArray(entry.skills)) return [];
  return dedupeSkills(entry.skills);
}

export function mergeAgentSkills(
  baseSkills: AgentSkillMeta[],
  overrideSkills: AgentSkillMeta[],
): AgentSkillMeta[] {
  return dedupeSkills([...(baseSkills || []), ...(overrideSkills || [])]);
}

export function upsertAgentSkill(agentId: string, skill: AgentSkillMeta): AgentSkillMeta[] {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId) {
    throw new Error('agentId is required');
  }

  const all = readOverridesFile();
  const entry = all[normalizedAgentId] && typeof all[normalizedAgentId] === 'object'
    ? all[normalizedAgentId]
    : { skills: [] };

  const merged = dedupeSkills([
    ...((entry.skills || []) as AgentSkillMeta[]),
    { name: String(skill.name || '').trim(), description: String(skill.description || '').trim() },
  ]);

  all[normalizedAgentId] = { skills: merged };
  writeOverridesFile(all);
  return merged;
}

export function removeAgentSkill(agentId: string, skillName: string): AgentSkillMeta[] {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId) throw new Error('agentId is required');

  const normalizedSkillName = normalizeSkillName(skillName);
  if (!normalizedSkillName) throw new Error('skillName is required');

  const all = readOverridesFile();
  const entry = all[normalizedAgentId];
  if (!entry || !Array.isArray(entry.skills)) return [];

  const filtered = entry.skills.filter(
    (s) => normalizeSkillName(s.name) !== normalizedSkillName,
  );

  all[normalizedAgentId] = { skills: filtered };
  writeOverridesFile(all);
  return filtered;
}

export function toggleAgentSkill(agentId: string, skillName: string, enabled: boolean): AgentSkillMeta[] {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId) throw new Error('agentId is required');

  const normalizedSkillName = normalizeSkillName(skillName);
  if (!normalizedSkillName) throw new Error('skillName is required');

  const all = readOverridesFile();
  const entry = all[normalizedAgentId];
  if (!entry || !Array.isArray(entry.skills)) return [];

  let found = false;
  const updated = entry.skills.map((s) => {
    if (normalizeSkillName(s.name) === normalizedSkillName) {
      found = true;
      const copy: AgentSkillMeta = { ...s };
      if (enabled) {
        delete copy.enabled; // undefined = enabled (default)
      } else {
        copy.enabled = false;
      }
      return copy;
    }
    return s;
  });

  if (!found) return entry.skills;

  all[normalizedAgentId] = { skills: updated };
  writeOverridesFile(all);
  return updated;
}

export function getEnabledAgentSkillOverrides(agentId: string): AgentSkillMeta[] {
  return getAgentSkillOverrides(agentId).filter((s) => s.enabled !== false);
}
