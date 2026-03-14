/**
 * Shared helper functions for tools.
 *
 * Extracted from the reference implementation's plan_mode.py and file_utils.py.
 */

import path from 'path';

// ---------------------------------------------------------------------------
// extractTaskTitle — from plan_mode.py:783-819
// ---------------------------------------------------------------------------

/** Prefixes to strip from Chinese task descriptions. */
const STRIP_PREFIXES = [
  '我需要', '我想要', '我想', '我要', '需要', '请帮我', '请帮忙',
  '帮我', '帮忙', '请', '我们需要', '我们要', '希望',
];

/** Punctuation to split on. */
const SPLIT_PUNCT = /[，。；、！？,.;!?\n]/;

/**
 * Extract a short task title from a Chinese reason string.
 *
 * - Strips common prefixes ("我需要", "请帮我", etc.)
 * - Splits on punctuation, takes first segment
 * - Limits to 15 characters
 */
export function extractTaskTitle(text: string | undefined | null): string {
  if (!text) return 'untitled';

  let t = text.trim();
  if (!t) return 'untitled';

  // Strip known prefixes
  for (const prefix of STRIP_PREFIXES) {
    if (t.startsWith(prefix)) {
      t = t.slice(prefix.length).trim();
      break; // only strip one prefix
    }
  }

  // Split on punctuation, take first segment
  const segments = t.split(SPLIT_PUNCT).filter(Boolean);
  t = segments[0] || t;

  // Limit to 15 characters
  if (t.length > 15) {
    t = t.slice(0, 15);
  }

  return t || 'untitled';
}

// ---------------------------------------------------------------------------
// sanitizeFolderName — from plan_mode.py:840-865
// ---------------------------------------------------------------------------

/**
 * Make a string safe for use as a folder name.
 *
 * - Removes path traversal (`..`, `/`, `\`)
 * - Preserves Chinese characters and alphanumerics
 * - Replaces unsafe chars with `-`
 * - Limits to 50 characters
 */
export function sanitizeFolderName(name: string): string {
  if (!name) return 'untitled';

  let s = name.trim();

  // Remove path traversal
  s = s.replace(/\.\./g, '');
  s = s.replace(/[/\\]/g, '-');

  // Replace unsafe filesystem characters, keep Chinese + alphanumeric + hyphen + underscore
  s = s.replace(/[^a-zA-Z0-9\u4e00-\u9fff\u3400-\u4dbf_-]/g, '-');

  // Collapse repeated hyphens
  s = s.replace(/-{2,}/g, '-');

  // Trim leading/trailing hyphens
  s = s.replace(/^-+|-+$/g, '');

  // Limit to 50 characters
  if (s.length > 50) {
    s = s.slice(0, 50);
  }

  return s || 'untitled';
}

// ---------------------------------------------------------------------------
// isPlanFileEmpty — from plan_mode.py:762-780
// ---------------------------------------------------------------------------

/**
 * Check whether plan content is essentially empty.
 * Returns true if content is under 50 characters (ignoring whitespace).
 */
export function isPlanFileEmpty(content: string | undefined | null): boolean {
  if (!content) return true;
  const stripped = content.replace(/\s+/g, '');
  return stripped.length < 50;
}

// ---------------------------------------------------------------------------
// getPathContext — from file_utils.py
// ---------------------------------------------------------------------------

/**
 * Return a context label for a file path relative to the workspace.
 *
 * Examples:
 *   - files inside `session/` → "(session file)"
 *   - files inside `shared/` → "(shared)"
 *   - files inside `skills/` → "(skill)"
 *   - everything else → ""
 */
export function getPathContext(filePath: string, wsRoot?: string): string {
  const rel = wsRoot ? path.relative(wsRoot, filePath) : filePath;
  const normalized = rel.replace(/\\/g, '/');

  if (normalized.startsWith('session/') || normalized.startsWith('sessions/')) {
    return '(session file)';
  }
  if (normalized.startsWith('shared/')) {
    return '(shared)';
  }
  if (normalized.startsWith('skills/')) {
    return '(skill)';
  }
  if (normalized.startsWith('subagents/')) {
    return '(子Agent资产)';
  }
  return '';
}

/**
 * Return search directories with labels for glob/grep tools.
 * Currently simplified to a single workspace directory.
 */
export function getSearchDirsWithLabels(wsRoot: string): Array<{ dir: string; label: string }> {
  const dirs: Array<{ dir: string; label: string }> = [
    { dir: wsRoot, label: '' },
  ];

  // Check for skills directory
  const skillsDir = path.join(wsRoot, 'skills');
  try {
    // eslint-disable-next-line no-eval
    const fs: any = eval('require')('fs');
    if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
      dirs.push({ dir: skillsDir, label: 'skills' });
    }
  } catch {
    // Ignore
  }

  return dirs;
}
