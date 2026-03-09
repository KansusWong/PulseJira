/**
 * Skill loader — parses SKILL.md files into SkillDefinition objects.
 *
 * Compatible with the awesome-claude-skills SKILL.md format:
 *   ---
 *   name: skill-name
 *   description: What it does
 *   version: 1.0.0
 *   requires:
 *     tools: [read_file, list_files]
 *   tags: [review, quality]
 *   ---
 *   ## Instructions
 *   ...markdown body...
 */

import fs from 'fs';
import path from 'path';
import type { SkillDefinition, SkillFrontmatter } from './types';

// ---------------------------------------------------------------------------
// YAML frontmatter parser (lightweight — avoids adding a YAML dependency)
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

/**
 * Parse YAML-like frontmatter. Handles simple key-value pairs, string arrays,
 * and one level of nesting. NOT a full YAML parser.
 */
function parseFrontmatter(raw: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentKey = '';
  let currentNested: Record<string, any> | null = null;

  for (const line of raw.split('\n')) {
    // Nested key (indented)
    const nestedMatch = line.match(/^  (\w+):\s*(.*)$/);
    if (nestedMatch && currentKey) {
      const [, nk, nv] = nestedMatch;
      if (!currentNested) currentNested = {};
      currentNested[nk] = parseValue(nv.trim());
      result[currentKey] = currentNested;
      continue;
    }

    // Top-level key
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch) {
      // Flush nested
      currentNested = null;
      const [, key, val] = topMatch;
      currentKey = key;
      result[key] = parseValue(val.trim());
    }
  }
  return result;
}

function parseValue(val: string): any {
  if (!val) return '';
  // Array: [a, b, c]
  if (val.startsWith('[') && val.endsWith(']')) {
    return val
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  // Quoted string
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a SKILL.md file content into a SkillDefinition.
 */
export function parseSkillMd(
  content: string,
  source: 'local' | 'remote',
  opts?: { remoteUrl?: string; localPath?: string; warnOnInvalid?: boolean }
): SkillDefinition | null {
  const shouldWarn = opts?.warnOnInvalid ?? true;
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    if (shouldWarn) {
      console.warn('[skill-loader] No valid frontmatter found in SKILL.md');
    }
    return null;
  }

  const [, frontmatterRaw, body] = match;
  const fm = parseFrontmatter(frontmatterRaw) as SkillFrontmatter;

  if (!fm.name || !fm.description) {
    if (shouldWarn) {
      console.warn('[skill-loader] SKILL.md missing required fields: name, description');
    }
    return null;
  }

  return {
    id: fm.name,
    name: fm.name,
    description: fm.description,
    version: fm.version || '1.0.0',
    tools: fm.requires?.tools || [],
    tags: fm.tags || [],
    source,
    remoteUrl: opts?.remoteUrl,
    localPath: opts?.localPath,
    instructions: body.trim(),
  };
}

/**
 * Load a skill from a local directory.
 * Expects the directory to contain a SKILL.md file.
 */
export function loadSkillFromDir(
  dirPath: string,
  opts?: { warnOnInvalid?: boolean }
): SkillDefinition | null {
  const skillMdPath = path.join(dirPath, 'SKILL.md');
  try {
    const stat = fs.statSync(skillMdPath);
    if (!stat.isFile()) return null;
  } catch {
    return null;
  }

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  return parseSkillMd(content, 'local', {
    localPath: dirPath,
    warnOnInvalid: opts?.warnOnInvalid ?? false,
  });
}

/**
 * Scan a directory for skill subdirectories and load all valid skills.
 */
export function loadLocalSkills(baseDir: string): SkillDefinition[] {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(baseDir, { encoding: 'utf-8' });
  } catch {
    return [];
  }

  const skills: SkillDefinition[] = [];

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry);
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) continue;

    const skill = loadSkillFromDir(fullPath, { warnOnInvalid: false });
    if (skill) skills.push(skill);
  }

  return skills;
}

/**
 * Format skill instructions for injection into an agent's system prompt.
 * Follows the soul.md merge pattern: appended with a separator.
 */
export function formatSkillsForPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';

  const sections = skills.map(
    (s) => `### Skill: ${s.name}\n\n${s.instructions}`
  );

  return `\n\n---\n\n## Loaded Skills\n\n${sections.join('\n\n---\n\n')}`;
}
