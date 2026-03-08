/**
 * Skill Registry — unified lookup for local and remote skills.
 *
 * Skills are registered at startup (from local skill dirs) and can be
 * dynamically added at runtime via remote fetch.
 */

import path from 'path';
import os from 'os';
import type { SkillDefinition } from './types';
import { loadLocalSkills } from './skill-loader';
import { embedSkill, embedAllSkills } from '../services/skill-embedder';

const registry = new Map<string, SkillDefinition>();

// ---------------------------------------------------------------------------
// Core registry API
// ---------------------------------------------------------------------------

export function registerSkill(skill: SkillDefinition): void {
  registry.set(skill.id, skill);
  // Fire-and-forget: embed skill for semantic discovery
  embedSkill(skill).catch((err) => console.error('[skill-registry] Embed skill failed:', err));
}

export function getSkill(id: string): SkillDefinition | undefined {
  return registry.get(id);
}

export function getAllSkills(): SkillDefinition[] {
  return Array.from(registry.values());
}

export function getSkillsByTag(tag: string): SkillDefinition[] {
  return getAllSkills().filter((s) => s.tags.includes(tag));
}

export function searchSkills(query: string): SkillDefinition[] {
  const q = query.toLowerCase();
  return getAllSkills().filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
  );
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let initialized = false;

function getSkillBaseDirs(): string[] {
  const projectSkills = path.join(process.cwd(), 'skills');
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const codexSkills = path.join(codexHome, 'skills');

  const unique = new Set<string>([projectSkills, codexSkills]);
  return Array.from(unique);
}

/**
 * Scan the project `skills/` directory for SKILL.md files and register them.
 * Idempotent — subsequent calls are no-ops.
 */
export function initializeSkillRegistry(): void {
  if (initialized) return;
  initialized = true;

  const locals: SkillDefinition[] = [];
  const loadedByDir: string[] = [];
  for (const baseDir of getSkillBaseDirs()) {
    const entries = loadLocalSkills(baseDir);
    if (entries.length === 0) continue;
    loadedByDir.push(`${baseDir}(${entries.length})`);
    locals.push(...entries);
  }

  for (const skill of locals) {
    // local skill wins by ID, later dirs can override older ones by same id
    registerSkill(skill);
  }

  if (locals.length > 0) {
    console.log(
      `[skill-registry] Loaded ${locals.length} local skill(s) from ${loadedByDir.join(', ')}: ${locals.map((s) => s.id).join(', ')}`,
    );
    // Fire-and-forget: embed all loaded skills for semantic discovery
    embedAllSkills(locals).catch((err) => console.error('[skill-registry] Embed all skills failed:', err));
  }
}

// ---------------------------------------------------------------------------
// Resolution (local-first, then remote fallback)
// ---------------------------------------------------------------------------

/**
 * Resolve a list of skill IDs to SkillDefinition objects.
 * Looks up local registry first. If a skill is not found locally,
 * the caller can optionally provide a `fetchRemote` callback to try remote.
 */
export async function resolveSkills(
  skillIds: string[],
  fetchRemote?: (id: string) => Promise<SkillDefinition | null>
): Promise<SkillDefinition[]> {
  const results: SkillDefinition[] = [];

  for (const id of skillIds) {
    let skill = getSkill(id);

    if (!skill && fetchRemote) {
      const fetched = await fetchRemote(id);
      skill = fetched ?? undefined;
      if (skill) {
        registerSkill(skill); // cache for future lookups
      }
    }

    if (skill) {
      results.push(skill);
    } else {
      console.warn(`[skill-registry] Skill "${id}" not found locally or remotely.`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Semantic skill resolution (intelligent routing)
// ---------------------------------------------------------------------------

/**
 * Find the best matching skill for a natural-language description.
 * Returns matches sorted by relevance score (descending).
 *
 * Resolution chain:
 *   1. High match (>0.85) → reuse directly
 *   2. Partial match (0.6-0.85) → return as candidate for extension
 *   3. Low match (<0.6) → try remote, then signal "not found"
 */
export interface SkillMatch {
  skill: SkillDefinition;
  score: number;
  strategy: 'reuse' | 'extend' | 'not_found';
}

export function findBestSkillMatch(query: string): SkillMatch[] {
  const q = query.toLowerCase();
  const allSkills = getAllSkills();

  const scored: SkillMatch[] = allSkills.map((skill) => {
    let score = 0;

    // Name exact match
    if (skill.name.toLowerCase() === q) score = 1.0;
    // Name contains
    else if (skill.name.toLowerCase().includes(q) || q.includes(skill.name.toLowerCase())) {
      score = 0.8;
    }

    // Description similarity (word overlap)
    const qWords = new Set(q.split(/\s+/).filter(w => w.length > 2));
    const descWords = new Set(
      `${skill.description} ${skill.tags.join(' ')}`.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );
    if (qWords.size > 0) {
      const overlap = [...qWords].filter(w => descWords.has(w)).length;
      const wordScore = overlap / qWords.size;
      score = Math.max(score, wordScore * 0.9);
    }

    // Tag match bonus
    for (const tag of skill.tags) {
      if (q.includes(tag.toLowerCase())) {
        score = Math.max(score, 0.7);
        break;
      }
    }

    const strategy: SkillMatch['strategy'] =
      score > 0.85 ? 'reuse' :
      score >= 0.6 ? 'extend' :
      'not_found';

    return { skill, score, strategy };
  });

  return scored
    .filter(m => m.score > 0.1)
    .sort((a, b) => b.score - a.score);
}
