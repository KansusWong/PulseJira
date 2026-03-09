/**
 * Remote skill fetcher — downloads skills from GitHub repositories.
 *
 * Primary target: https://github.com/ComposioHQ/awesome-claude-skills
 *
 * Fetches SKILL.md via GitHub raw content API, parses it, and caches
 * the result in the local registry (and optionally in Supabase).
 */

import type { SkillDefinition } from './types';
import { parseSkillMd } from './skill-loader';

const AWESOME_SKILLS_REPO = 'ComposioHQ/awesome-claude-skills';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const GITHUB_API_BASE = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Fetch a specific skill by directory name
// ---------------------------------------------------------------------------

/**
 * Fetch a skill from the awesome-claude-skills repo by skill name.
 *
 * @param skillName  Directory name in the repo (e.g., 'code-review')
 * @param repo       Override repo in `owner/repo` format
 * @param branch     Override branch (default: 'main')
 */
export async function fetchRemoteSkill(
  skillName: string,
  repo: string = AWESOME_SKILLS_REPO,
  branch: string = 'main'
): Promise<SkillDefinition | null> {
  const url = `${GITHUB_RAW_BASE}/${repo}/${branch}/${skillName}/SKILL.md`;

  try {
    const res = await fetch(url, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`[skill-fetcher] Skill "${skillName}" not found at ${url}`);
        return null;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const content = await res.text();
    const skill = parseSkillMd(content, 'remote', {
      remoteUrl: `https://github.com/${repo}/tree/${branch}/${skillName}`,
    });

    if (skill) {
      skill.cachedAt = new Date().toISOString();
    }

    return skill;
  } catch (error: any) {
    console.error(`[skill-fetcher] Failed to fetch skill "${skillName}":`, error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Search the repo for available skills (via GitHub API)
// ---------------------------------------------------------------------------

/**
 * List available skill directories in the awesome-claude-skills repo.
 * Returns directory names that can be passed to `fetchRemoteSkill()`.
 */
export async function listRemoteSkills(
  repo: string = AWESOME_SKILLS_REPO,
): Promise<string[]> {
  const url = `${GITHUB_API_BASE}/repos/${repo}/contents`;

  try {
    const res = await fetch(url, {
      headers: { ...githubHeaders(), Accept: 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const entries: { name: string; type: string }[] = await res.json();
    return entries
      .filter((e) => e.type === 'dir')
      .map((e) => e.name)
      .filter((name) => !name.startsWith('.'));
  } catch (error: any) {
    console.error('[skill-fetcher] Failed to list remote skills:', error.message);
    return [];
  }
}

/**
 * Search remote skills by keyword (name match against directory listing).
 * For deeper search, fetch individual SKILL.md files and check descriptions.
 */
export async function searchRemoteSkills(
  query: string,
  repo: string = AWESOME_SKILLS_REPO
): Promise<string[]> {
  const all = await listRemoteSkills(repo);
  const q = query.toLowerCase();
  return all.filter((name) => name.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'RebuilD-SkillFetcher',
  };
  // Optional: use a GitHub token for higher rate limits
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
