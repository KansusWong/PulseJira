/**
 * Skill system type definitions.
 *
 * Compatible with the awesome-claude-skills SKILL.md format:
 *   https://github.com/ComposioHQ/awesome-claude-skills
 */

/** Parsed YAML frontmatter from a SKILL.md file. */
export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  license?: string;
  requires?: {
    mcp?: string[];
    tools?: string[];
  };
  tags?: string[];
}

/** A fully resolved skill definition ready for injection into an agent. */
export interface SkillDefinition {
  /** Unique identifier — the `name` from frontmatter (hyphen-case). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** What the skill does and when to activate it. */
  description: string;
  /** Semver version string. */
  version: string;
  /** Tool names this skill requires. */
  tools: string[];
  /** Tags for discovery and filtering. */
  tags: string[];
  /** Source type. */
  source: 'local' | 'remote';
  /** GitHub URL if remote. */
  remoteUrl?: string;
  /** Local filesystem path if local. */
  localPath?: string;
  /** The full instruction body (markdown) — injected into agent system prompt. */
  instructions: string;
  /** When this skill was last fetched (remote only). */
  cachedAt?: string;
}
