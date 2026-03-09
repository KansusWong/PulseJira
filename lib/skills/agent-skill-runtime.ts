import { getAgent } from '@/lib/config/agent-registry';
import { getAgentSkillOverrides, mergeAgentSkills } from '@/lib/config/agent-skill-overrides';
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
 */
export function buildSkillPromptForAgent(agentId: string): string {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId) return '';

  const meta = getAgent(normalizedAgentId);
  if (!meta) return '';

  const mergedSkills = mergeAgentSkills(
    meta.skills || [],
    getAgentSkillOverrides(normalizedAgentId),
  );
  const skillIds = uniqueSkillIds(mergedSkills.map((s) => s.name));
  if (skillIds.length === 0) return '';

  initializeSkillRegistry();

  const definitions: SkillDefinition[] = skillIds
    .map((id) => getSkill(id))
    .filter((s): s is SkillDefinition => !!s);

  if (definitions.length === 0) return '';
  return formatSkillsForPrompt(definitions);
}

