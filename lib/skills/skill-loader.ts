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
 *   resources:
 *     inject_references: true
 *     max_inject_size: 50000
 *   ---
 *   ## Instructions
 *   ...markdown body...
 */

import fs from 'fs';
import path from 'path';
import type {
  SkillDefinition,
  SkillFrontmatter,
  SkillResources,
  SkillResourceType,
} from './types';

// ---------------------------------------------------------------------------
// MIME type mapping
// ---------------------------------------------------------------------------

const MIME_MAP: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.ts': 'application/typescript',
  '.js': 'application/javascript',
  '.py': 'text/x-python',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

function guessMimeType(filename: string): string {
  return MIME_MAP[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

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
  // Boolean literals
  if (val === 'true') return true;
  if (val === 'false') return false;
  // Numeric literals
  if (/^\d+$/.test(val)) return parseInt(val, 10);
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
// Resource scanning & loading
// ---------------------------------------------------------------------------

/** Directory names that map to resource types. */
const RESOURCE_DIRS: Record<string, SkillResourceType> = {
  references: 'reference',
  scripts: 'script',
  assets: 'asset',
};

/**
 * Scan resource subdirectories (references/, scripts/, assets/) under a Skill
 * directory and return file metadata without reading content.
 * Skips hidden files and symlinks.
 */
export function scanResources(dirPath: string): SkillResources | undefined {
  const resources: SkillResources = { references: [], scripts: [], assets: [] };
  let hasAny = false;

  for (const [dirName, resourceType] of Object.entries(RESOURCE_DIRS)) {
    const subDir = path.join(dirPath, dirName);
    let entries: string[];
    try {
      entries = fs.readdirSync(subDir, { encoding: 'utf-8' });
    } catch {
      continue; // directory doesn't exist — skip
    }

    const bucket =
      resourceType === 'reference' ? resources.references :
      resourceType === 'script' ? resources.scripts :
      resources.assets;

    for (const entry of entries) {
      // Skip hidden files
      if (entry.startsWith('.')) continue;

      const fullPath = path.join(subDir, entry);
      try {
        const stat = fs.lstatSync(fullPath);
        // Skip symlinks and directories
        if (stat.isSymbolicLink() || stat.isDirectory()) continue;

        bucket.push({
          path: `${dirName}/${entry}`,
          type: resourceType,
          mimeType: guessMimeType(entry),
          sizeBytes: stat.size,
        });
        hasAny = true;
      } catch {
        // stat failed — skip
      }
    }
  }

  return hasAny ? resources : undefined;
}

/** Max single-file size for loadResourceContent (500 KB). */
const MAX_RESOURCE_FILE_SIZE = 500 * 1024;

/** Allowed resource path prefixes. */
const ALLOWED_PREFIXES = ['references/', 'scripts/', 'assets/'];

/**
 * Safely read a single resource file's content.
 *
 * Security layers:
 *   1. Null-byte rejection
 *   2. Prefix whitelist (references/ | scripts/ | assets/)
 *   3. Path traversal check via path.relative()
 *   4. Symlink / binary / oversize rejection
 */
export function loadResourceContent(skillDirPath: string, resourcePath: string): string {
  // Layer 1: null byte
  if (resourcePath.includes('\0')) {
    throw new Error('Invalid resource path: contains null byte');
  }

  // Layer 2: prefix whitelist
  if (!ALLOWED_PREFIXES.some((p) => resourcePath.startsWith(p))) {
    throw new Error(`Invalid resource path: must start with ${ALLOWED_PREFIXES.join(' | ')}`);
  }

  // Layer 3: path traversal
  const fullPath = path.join(skillDirPath, resourcePath);
  const relative = path.relative(skillDirPath, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid resource path: directory traversal detected');
  }

  // Layer 4a: symlink check
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(fullPath);
  } catch {
    throw new Error(`Resource file not found: ${resourcePath}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error('Resource file is a symbolic link — not allowed');
  }

  // Layer 4b: oversize check
  if (stat.size > MAX_RESOURCE_FILE_SIZE) {
    throw new Error(
      `Resource file too large: ${stat.size} bytes (limit ${MAX_RESOURCE_FILE_SIZE} bytes)`
    );
  }

  // Layer 4c: binary check — read a small chunk and look for null bytes
  const fd = fs.openSync(fullPath, 'r');
  try {
    const probe = Buffer.alloc(Math.min(512, stat.size));
    fs.readSync(fd, probe, 0, probe.length, 0);
    if (probe.includes(0)) {
      throw new Error('Resource file appears to be binary — not allowed');
    }
  } finally {
    fs.closeSync(fd);
  }

  return fs.readFileSync(fullPath, 'utf-8');
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

  // Build resourceConfig from frontmatter (with defaults)
  const resourceConfig = {
    inject_references: fm.resources?.inject_references === true,
    max_inject_size: typeof fm.resources?.max_inject_size === 'number'
      ? fm.resources.max_inject_size
      : 50_000,
  };

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
    coreSkill: fm.core_skill === true,
    resourceConfig,
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
  const skill = parseSkillMd(content, 'local', {
    localPath: dirPath,
    warnOnInvalid: opts?.warnOnInvalid ?? false,
  });

  if (!skill) return null;

  // Scan resource subdirectories
  const resources = scanResources(dirPath);
  if (resources) {
    skill.resources = resources;
  }

  return skill;
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
 *
 * When `inject_references: true` is set in the skill's resourceConfig,
 * reference documents are automatically appended to the skill section
 * (subject to max_inject_size budget).
 *
 * A resource manifest is always appended when resources exist, informing
 * the agent that `read_skill_resource` can be used for on-demand loading.
 */
export function formatSkillsForPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';

  const sections = skills.map((s) => {
    let section = `### Skill: ${s.name}\n\n${s.instructions}`;

    // --- Inject references if configured ---
    if (s.resourceConfig?.inject_references && s.resources?.references.length) {
      const budget = s.resourceConfig.max_inject_size;
      let used = 0;
      const injected: string[] = [];

      for (const ref of s.resources.references) {
        if (used >= budget) break;
        if (!s.localPath) break;

        try {
          const content = loadResourceContent(s.localPath, ref.path);
          if (used + content.length > budget) {
            // Inject partial up to budget
            const remaining = budget - used;
            injected.push(
              `#### Reference: ${ref.path}\n\n${content.slice(0, remaining)}\n\n*(truncated — use \`read_skill_resource\` for full content)*`
            );
            used = budget;
          } else {
            injected.push(`#### Reference: ${ref.path}\n\n${content}`);
            used += content.length;
          }
        } catch {
          // Skip unreadable files silently
        }
      }

      if (injected.length > 0) {
        section += `\n\n---\n\n**Injected References:**\n\n${injected.join('\n\n---\n\n')}`;
      }
    }

    // --- Append resource manifest (always, if resources exist) ---
    const allResources = [
      ...(s.resources?.references ?? []),
      ...(s.resources?.scripts ?? []),
      ...(s.resources?.assets ?? []),
    ];
    if (allResources.length > 0) {
      const listing = allResources
        .map((r) => `- \`${r.path}\` (${r.type}, ${formatBytes(r.sizeBytes)})`)
        .join('\n');
      section += `\n\n**Available Resources** *(use \`read_skill_resource\` tool with skill_id="${s.id}" to load)*:\n${listing}`;
    }

    return section;
  });

  return `\n\n---\n\n## Loaded Skills\n\n${sections.join('\n\n---\n\n')}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
