/**
 * MateRegistry — unified registration center for mate (agent persona) definitions.
 *
 * Replaces SubagentRegistry as the single source of truth for all agent definitions.
 * Supports three definition sources (scanned in priority order):
 *   1. mates/{name}/MATE.md          (new canonical format)
 *   2. .agents/{name}.md             (legacy flat format)
 *   3. subagents/{name}/agent.md     (legacy nested format)
 *
 * Three-level matching algorithm:
 *   Level 1: Exact name match (user explicitly requests @mate-name)
 *   Level 2: Domain match (task keywords intersect mate.domains)
 *   Level 3: Keyword scoring (fallback — inherited from SubagentRegistry)
 *
 * Phase 1 (P0): File-based only, process-level singleton.
 * Phase 2: DB integration via mate_definitions table.
 */

import path from 'path';
import type { MateDefinition } from '../core/types';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

// ---------------------------------------------------------------------------
// Frontmatter parser (shared with SubagentRegistry, duplicated for decoupling)
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  meta: Record<string, string>;
  body: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
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

// ---------------------------------------------------------------------------
// Keyword scoring (inherited from SubagentRegistry for Level 3 fallback)
// ---------------------------------------------------------------------------

const SPECIAL_MATCHES: Record<string, { match: string; bonus: number }[]> = {
  review: [{ match: 'review', bonus: 3 }],
  code: [{ match: 'code', bonus: 2 }],
  research: [{ match: 'research', bonus: 3 }],
  debug: [{ match: 'debug', bonus: 3 }],
  test: [{ match: 'test', bonus: 2 }],
  deploy: [{ match: 'deploy', bonus: 3 }],
  refactor: [{ match: 'refactor', bonus: 3 }],
  analyze: [{ match: 'analyze', bonus: 2 }, { match: 'analysis', bonus: 2 }],
  security: [{ match: 'security', bonus: 3 }, { match: 'audit', bonus: 2 }],
  design: [{ match: 'design', bonus: 2 }, { match: 'architect', bonus: 2 }],
  plan: [{ match: 'plan', bonus: 2 }, { match: 'strategy', bonus: 2 }],
};

function scoreKeywordMatch(taskDesc: string, agentDesc: string): number {
  const taskWords = taskDesc.toLowerCase().split(/[\s,.\-_/]+/).filter(Boolean);
  const agentWords = agentDesc.toLowerCase().split(/[\s,.\-_/]+/).filter(Boolean);

  let score = 0;

  for (const word of taskWords) {
    if (word.length <= 3) continue;
    if (agentWords.some(aw => aw.includes(word) || word.includes(aw))) {
      score += 1;
    }
  }

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

// ---------------------------------------------------------------------------
// Domain matching (Level 2)
// ---------------------------------------------------------------------------

function scoreDomainMatch(taskDesc: string, domains: string[]): number {
  if (domains.length === 0) return 0;

  const taskLower = taskDesc.toLowerCase();
  let score = 0;

  for (const domain of domains) {
    if (taskLower.includes(domain.toLowerCase())) {
      score += 5; // Domain match is stronger than keyword
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// MateRegistry
// ---------------------------------------------------------------------------

let _singleton: MateRegistry | null = null;
let _singletonKey: string | null = null;

/**
 * Get (or create) the process-level MateRegistry singleton.
 * Scans filesystem once; call registry.refresh() to force rescan.
 */
export function getMateRegistry(searchDirs: string[] = ['.']): MateRegistry {
  const key = searchDirs.join('\0');
  if (_singleton && _singletonKey === key) return _singleton;
  _singleton = new MateRegistry(searchDirs);
  _singletonKey = key;
  return _singleton;
}

export class MateRegistry {
  private definitions: MateDefinition[] = [];
  private searchDirs: string[];

  constructor(searchDirs: string[]) {
    this.searchDirs = searchDirs;
    this.refresh();
  }

  /** Rescan all directories and reload definitions. */
  refresh(): void {
    this.definitions = [];

    for (const dir of this.searchDirs) {
      // Source 1 (canonical): mates/{name}/MATE.md
      this._scanNestedDir(path.join(dir, 'mates'), 'MATE.md');

      // Source 2 (legacy): .agents/{name}.md
      this._scanFlatDir(path.join(dir, '.agents'));

      // Source 3 (legacy): subagents/{name}/agent.md
      this._scanNestedDir(path.join(dir, 'subagents'), 'agent.md');

      // Source 4 (legacy): agents/subagents/{name}/agent.md
      this._scanNestedDir(path.join(dir, 'agents', 'subagents'), 'agent.md');
    }
  }

  // -------------------------------------------------------------------------
  // File scanning
  // -------------------------------------------------------------------------

  private _scanFlatDir(agentsDir: string): void {
    let files: string[];
    try {
      files = fs.readdirSync(agentsDir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const name = path.basename(file, '.md');
      if (this.definitions.some(d => d.name === name)) continue;

      const filePath = path.join(agentsDir, file);
      this._loadDefinition(filePath, name);
    }
  }

  private _scanNestedDir(baseDir: string, mdFileName: string): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(baseDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(baseDir, entry);
      try {
        if (!fs.statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const mdPath = path.join(entryPath, mdFileName);
      try {
        fs.accessSync(mdPath);
      } catch {
        continue;
      }

      if (this.definitions.some(d => d.name === entry)) continue;
      this._loadDefinition(mdPath, entry);
    }
  }

  private _loadDefinition(filePath: string, fallbackName: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(content);

      const name = meta.name || fallbackName;
      const domains = (meta.domains || '')
        .split(',')
        .map((d: string) => d.trim())
        .filter(Boolean);
      const toolsAllow = (meta.tools || meta.tools_allow || '')
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);
      const toolsDeny = (meta.tools_deny || '')
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);

      this.definitions.push({
        id: name,
        name,
        display_name: meta.display_name || meta.displayName,
        description: meta.description || '',
        domains,
        tools_allow: toolsAllow,
        tools_deny: toolsDeny,
        model: meta.model || 'inherit',
        system_prompt: body,
        can_lead: meta.can_lead === 'true' || meta.canLead === 'true',
        status: 'idle',
        source: 'file',
        file_path: filePath,
        metadata: {},
      });
    } catch {
      // Skip unreadable files
    }
  }

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

  /** Get all registered mate definitions. */
  getAll(): MateDefinition[] {
    return this.definitions;
  }

  /** Get a mate by exact name. */
  get(name: string): MateDefinition | undefined {
    return this.definitions.find(d => d.name === name);
  }

  /** Register a mate definition programmatically (e.g. from DB or dynamic creation). */
  register(def: MateDefinition): void {
    const existing = this.definitions.findIndex(d => d.name === def.name);
    if (existing >= 0) {
      this.definitions[existing] = def;
    } else {
      this.definitions.push(def);
    }
  }

  // -------------------------------------------------------------------------
  // Three-level matching
  // -------------------------------------------------------------------------

  /**
   * Match a mate for a task (small task via TaskTool).
   * Returns the best-matching mate, or null if none score above threshold.
   *
   * Level 1: exact name → Level 2: domain → Level 3: keyword scoring
   */
  matchForTask(taskDescription: string, explicitName?: string): MateDefinition | null {
    // Level 1: explicit name
    if (explicitName) {
      const exact = this.get(explicitName);
      if (exact) return exact;
    }

    return this._bestMatch(taskDescription);
  }

  /**
   * Match a lead mate for a mission (large project).
   * Only considers mates with can_lead=true.
   * Falls back to best overall match if no leads are registered.
   */
  matchForLead(missionDescription: string, explicitName?: string): MateDefinition | null {
    // Level 1: explicit name
    if (explicitName) {
      const exact = this.get(explicitName);
      if (exact) return exact;
    }

    // Try leads first
    const leads = this.definitions.filter(d => d.can_lead);
    if (leads.length > 0) {
      const result = this._bestMatchFrom(missionDescription, leads);
      if (result) return result;
    }

    // Fall back to any mate
    return this._bestMatch(missionDescription);
  }

  /**
   * List mates matching given domain tags.
   * Used by MissionEngine to assemble a team.
   */
  listByDomains(domains: string[]): MateDefinition[] {
    if (domains.length === 0) return [];

    const domainSet = new Set(domains.map(d => d.toLowerCase()));
    return this.definitions.filter(mate =>
      mate.domains.some(d => domainSet.has(d.toLowerCase()))
    );
  }

  // -------------------------------------------------------------------------
  // Backward compatibility: SubagentRegistry-compatible API
  // -------------------------------------------------------------------------

  /**
   * @deprecated Use matchForTask() instead.
   * Provided for backward compatibility with SubagentRegistry callers.
   */
  matchByDescription(taskDesc: string): string | null {
    const result = this._bestMatch(taskDesc);
    return result?.name ?? null;
  }

  // -------------------------------------------------------------------------
  // Internal scoring
  // -------------------------------------------------------------------------

  private _bestMatch(taskDescription: string): MateDefinition | null {
    return this._bestMatchFrom(taskDescription, this.definitions);
  }

  private _bestMatchFrom(taskDescription: string, candidates: MateDefinition[]): MateDefinition | null {
    if (candidates.length === 0) return null;

    let bestMate: MateDefinition | null = null;
    let bestScore = 0;

    for (const mate of candidates) {
      // Level 2: domain match (score 5 per hit)
      const domainScore = scoreDomainMatch(taskDescription, mate.domains);

      // Level 3: keyword match (score 1-3 per hit)
      const keywordScore = scoreKeywordMatch(taskDescription, mate.description);

      const totalScore = domainScore + keywordScore;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMate = mate;
      }
    }

    // Threshold: require at least a score of 2 (same as old SubagentRegistry)
    return bestScore >= 2 ? bestMate : null;
  }
}
