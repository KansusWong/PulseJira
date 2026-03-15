/**
 * Skill display-name persistence — reads/writes a JSON file at
 * `agents/skill-display-names.json` to let users override
 * the human-visible name of any skill without editing SKILL.md.
 */

import fs from 'fs';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'agents', 'skill-display-names.json');

function ensureDir(): void {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readAll(): Record<string, string> {
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function getAllDisplayNames(): Record<string, string> {
  return readAll();
}

export function getSkillDisplayName(skillId: string): string | undefined {
  return readAll()[skillId];
}

export function setSkillDisplayName(skillId: string, displayName: string): void {
  ensureDir();
  const all = readAll();
  all[skillId] = displayName;
  fs.writeFileSync(FILE_PATH, JSON.stringify(all, null, 2), 'utf-8');
}
