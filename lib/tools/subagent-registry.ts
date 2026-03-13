/**
 * SubagentRegistry — manages subagent definitions loaded from .md files.
 *
 * Aligns with reference task.py's subagent registry system.
 * Supports keyword-based matching to auto-select subagents for tasks.
 */

import path from 'path';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

// =====================================================================
// Types
// =====================================================================

export interface SubagentDefinition {
  name: string;
  description: string;
  tools: string[];
  model: string;        // 'inherit' | specific model name
  systemPrompt: string;
}

// =====================================================================
// Frontmatter parser
// =====================================================================

/**
 * Parse a simple YAML-like frontmatter from a markdown file.
 * Supports: name, description, tools, model fields.
 */
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};

  if (!content.startsWith('---')) {
    return { meta, body: content };
  }

  const endIdx = content.indexOf('\n---', 3);
  if (endIdx < 0) {
    return { meta, body: content };
  }

  const frontmatter = content.substring(3, endIdx).trim();
  const body = content.substring(endIdx + 4).trim();

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      meta[key] = value;
    }
  }

  return { meta, body };
}

// =====================================================================
// Keyword matching algorithm — from task.py:274-333
// =====================================================================

/** Special keyword pairs that get bonus scores. */
const SPECIAL_MATCHES: Record<string, { match: string; bonus: number }[]> = {
  review: [{ match: 'review', bonus: 3 }],
  code: [{ match: 'code', bonus: 2 }],
  research: [{ match: 'research', bonus: 3 }],
  debug: [{ match: 'debug', bonus: 3 }],
  test: [{ match: 'test', bonus: 2 }],
  deploy: [{ match: 'deploy', bonus: 3 }],
  refactor: [{ match: 'refactor', bonus: 3 }],
  analyze: [{ match: 'analyze', bonus: 2 }, { match: 'analysis', bonus: 2 }],
};

/**
 * Score how well a task description matches a subagent's description.
 * Returns a score >= 0. Higher = better match.
 */
function scoreMatch(taskDesc: string, agentDesc: string): number {
  const taskWords = taskDesc.toLowerCase().split(/[\s,.\-_/]+/).filter(Boolean);
  const agentWords = agentDesc.toLowerCase().split(/[\s,.\-_/]+/).filter(Boolean);

  let score = 0;

  // Basic word overlap scoring
  for (const word of taskWords) {
    if (word.length <= 3) continue; // Skip short words
    if (agentWords.some(aw => aw.includes(word) || word.includes(aw))) {
      score += 1;
    }
  }

  // Special match bonuses
  for (const [keyword, matches] of Object.entries(SPECIAL_MATCHES)) {
    const taskHas = taskWords.some(w => w.includes(keyword));
    if (taskHas) {
      for (const { match, bonus } of matches) {
        if (agentWords.some(w => w.includes(match))) {
          score += bonus;
        }
      }
    }
  }

  return score;
}

// =====================================================================
// SubagentRegistry
// =====================================================================

export class SubagentRegistry {
  private definitions: SubagentDefinition[] = [];
  private searchDirs: string[];

  constructor(searchDirs: string[]) {
    this.searchDirs = searchDirs;
    this.refresh();
  }

  /** Scan search directories for .md subagent definitions. */
  refresh(): void {
    this.definitions = [];

    for (const dir of this.searchDirs) {
      const agentsDir = path.join(dir, '.agents');

      let files: string[];
      try {
        files = fs.readdirSync(agentsDir);
      } catch {
        continue; // Directory doesn't exist
      }

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const filePath = path.join(agentsDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const { meta, body } = parseFrontmatter(content);

          if (!meta.name) {
            // Use filename without extension as name
            meta.name = path.basename(file, '.md');
          }

          this.definitions.push({
            name: meta.name,
            description: meta.description || '',
            tools: (meta.tools || '').split(',').map(t => t.trim()).filter(Boolean),
            model: meta.model || 'inherit',
            systemPrompt: body,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  getAll(): SubagentDefinition[] {
    return this.definitions;
  }

  get(name: string): SubagentDefinition | undefined {
    return this.definitions.find(d => d.name === name);
  }

  /**
   * Find the best matching subagent for a task description.
   * Returns null if no match scores >= 2.
   */
  matchByDescription(taskDesc: string): string | null {
    if (this.definitions.length === 0) return null;

    let bestName: string | null = null;
    let bestScore = 0;

    for (const def of this.definitions) {
      const score = scoreMatch(taskDesc, def.description);
      if (score > bestScore) {
        bestScore = score;
        bestName = def.name;
      }
    }

    // Threshold: score must be >= 2 to count as a match
    return bestScore >= 2 ? bestName : null;
  }
}
