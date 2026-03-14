import { getAgent } from '@/lib/config/agent-registry';
import { getEnabledAgentSkillOverrides, mergeAgentSkills } from '@/lib/config/agent-skill-overrides';
import { formatSkillsForPrompt } from './skill-loader';
import { getSkill, initializeSkillRegistry } from './skill-registry';
import type { SkillDefinition } from './types';

function uniqueSkillIds(ids: string[]): string[] {
  const set = new Set<string>();
  for (const id of ids) {
    const normalized = String(id || '').trim();
    if (!normalized) continue;
    set.add(normalized);
  }
  return Array.from(set);
}

/**
 * Build runtime skill prompt extension for an agent.
 * Local skills are loaded from `skills/<id>/SKILL.md`.
 *
 * @param agentId - Agent identifier (e.g. 'rebuild')
 * @param options.exclude - Skill IDs to exclude from the prompt
 */
export function buildSkillPromptForAgent(
  agentId: string,
  options?: { exclude?: string[] },
): string {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId) return '';

  const meta = getAgent(normalizedAgentId);
  if (!meta) return '';

  const mergedSkills = mergeAgentSkills(
    meta.skills || [],
    getEnabledAgentSkillOverrides(normalizedAgentId),
  );
  const skillIds = uniqueSkillIds(mergedSkills.map((s) => s.name));
  if (skillIds.length === 0) return '';

  // Build exclude set (match by skill ID or directory slug)
  const excludeSet = options?.exclude
    ? new Set(options.exclude.map(s => s.trim().toLowerCase()))
    : null;

  initializeSkillRegistry();

  // Resolve skill IDs and deduplicate by canonical skill.id.
  // The same skill may appear under different IDs (e.g., SKILL.md name "前端界面设计"
  // and directory slug "frontend-design" both resolve to the same SkillDefinition).
  const definitions: SkillDefinition[] = [];
  const seen = new Set<string>();
  for (const id of skillIds) {
    // Skip excluded skills
    if (excludeSet && excludeSet.has(id.trim().toLowerCase())) continue;

    const skill = getSkill(id);
    if (!skill || seen.has(skill.id)) continue;

    // Also check canonical skill.id against exclude list
    if (excludeSet && excludeSet.has(skill.id.trim().toLowerCase())) continue;

    seen.add(skill.id);
    definitions.push(skill);
  }

  if (definitions.length === 0) return '';
  return formatSkillsForPrompt(definitions);
}

