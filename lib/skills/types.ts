/**
 * Skill system type definitions.
 *
 * Compatible with the awesome-claude-skills SKILL.md format:
 *   https://github.com/ComposioHQ/awesome-claude-skills
 */

// ---------------------------------------------------------------------------
// Resource types
// ---------------------------------------------------------------------------

/** 资源文件分类 */
export type SkillResourceType = 'reference' | 'script' | 'asset';

/** 单个资源文件的元数据（仅路径和元信息，不含内容） */
export interface SkillResource {
  /** 相对于 Skill 目录的路径（如 "references/editing.md"） */
  path: string;
  /** 资源分类 */
  type: SkillResourceType;
  /** MIME 类型提示 */
  mimeType?: string;
  /** 文件大小（字节），用于注入预算控制 */
  sizeBytes: number;
}

/** Skill 资源清单 */
export interface SkillResources {
  references: SkillResource[];
  scripts: SkillResource[];
  assets: SkillResource[];
}

// ---------------------------------------------------------------------------
// Frontmatter & definition
// ---------------------------------------------------------------------------

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
  /** 是否为核心技能（预加载 & 前端分区） */
  core_skill?: boolean;
  /** 资源层配置 */
  resources?: {
    inject_references?: boolean;
    max_inject_size?: number;
  };
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
  /** 资源清单（eagerly scanned metadata, lazy content） */
  resources?: SkillResources;
  /** 是否为核心技能 */
  coreSkill: boolean;
  /** 解析后的资源配置（已填充默认值） */
  resourceConfig?: {
    inject_references: boolean;
    max_inject_size: number;
  };
}
