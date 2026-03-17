/**
 * RebuilD Agent — single autonomous software engineering agent.
 *
 * Replaces all previous agents (planner, analyst, reviewer, developer,
 * deployer, decision-maker, architect, chat-assistant) with a single
 * agent backed by a comprehensive tool set.
 */

import fs from 'fs';
import path from 'path';
import { BaseAgent } from '@/lib/core/base-agent';
import type { BaseTool } from '@/lib/core/base-tool';
import type { LazyPromptModule, ToolTierGroup } from '@/lib/core/types';
import { getToolsCached, isToolRegistered } from '@/lib/tools/index';
import { loadPromptFile } from '@/lib/config/agent-config';

// Workspace-scoped tools (require runtime context)
import { CodeWriteTool } from '@/lib/tools/code-write';
import { CodeEditTool } from '@/lib/tools/code-edit';
import { MultiEditTool } from '@/lib/tools/multi-edit';
import { RunCommandTool, BashBackgroundTool } from '@/lib/tools/run-command';
import { RunTestsTool } from '@/lib/tools/run-tests';
import { GitCommitTool } from '@/lib/tools/git-commit';
import { FileReadTool } from '@/lib/tools/fs-read';
import { FileListTool } from '@/lib/tools/fs-list';
import { GlobTool } from '@/lib/tools/glob';
import { GrepTool } from '@/lib/tools/grep';
import { BlackboardReadTool } from '@/lib/tools/blackboard-read';
import { BlackboardWriteTool } from '@/lib/tools/blackboard-write';
import { MemoryTool } from '@/lib/tools/memory';
import { VaultTool } from '@/lib/tools/vault';
import { ReadDocumentTool } from '@/lib/tools/read-document';
import { Blackboard } from '@/lib/blackboard';

// ---------------------------------------------------------------------------
// Lazy prompt modules — loaded once and cached in memory
// ---------------------------------------------------------------------------

const MODULES_DIR = path.join(process.cwd(), 'agents', 'rebuild', 'prompts', 'modules');

/** Module definitions: id → { file, triggerTools }. */
const LAZY_MODULE_DEFS: Array<{ id: string; file: string; triggerTools: string[] }> = [
  {
    id: 'task-framework',
    file: 'task-framework.md',
    triggerTools: ['todo_write', 'todo_read', 'enter_plan_mode', 'exit_plan_mode', 'ask_user_question', 'task'],
  },
  {
    id: 'tools-strategy',
    file: 'tools-strategy.md',
    triggerTools: ['glob', 'grep', 'semantic_search', 'read', 'code_write', 'code_edit', 'multi_edit', 'read_document'],
  },
  {
    id: 'git',
    file: 'git.md',
    triggerTools: ['git_commit'],
  },
  {
    id: 'filesystem',
    file: 'filesystem.md',
    triggerTools: ['write', 'code_write', 'code_edit', 'multi_edit', 'ls'],
  },
  {
    id: 'subagent',
    file: 'subagent.md',
    triggerTools: ['task'],
  },
  {
    id: 'memory',
    file: 'memory.md',
    triggerTools: ['memory'],
  },
  {
    id: 'vault',
    file: 'vault.md',
    triggerTools: ['vault'],
  },
];

/** Cached loaded modules (loaded once on first call). */
let _cachedLazyModules: LazyPromptModule[] | null = null;

function loadLazyModules(): LazyPromptModule[] {
  if (_cachedLazyModules) return _cachedLazyModules;

  const modules: LazyPromptModule[] = [];
  for (const def of LAZY_MODULE_DEFS) {
    const filePath = path.join(MODULES_DIR, def.file);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        modules.push({ id: def.id, content, triggerTools: def.triggerTools });
      }
    } catch (e) {
      console.warn(`[rebuild] Failed to load lazy module "${def.id}":`, e);
    }
  }

  _cachedLazyModules = modules;
  return modules;
}

/** Tools that can be resolved from global registry (no workspace needed). */
export const GLOBAL_TOOL_NAMES = [
  'web_search',
  'web_fetch',
  'browse_url',
  'enter_plan_mode', 'exit_plan_mode', 'ask_user_question',
  'todo_write', 'todo_read',
  'task',
  'discover_skills', 'read_skill_resource',
  'store_code_pattern',
  'semantic_search',
  'execute_code', 'execute_python', 'python_repl',
  'check_executor', 'reset_python_env', 'show_python_vars',
  'browser',
  'analyze_image', 'generate_image', 'edit_image', 'generate_video',
  'visualizer',
  'automation',
  'screenshot', 'mouse_click', 'keyboard_type', 'keyboard_hotkey', 'mouse_move',
];

/**
 * Create a RebuilD agent instance.
 *
 * @param options.workspace - Absolute path to workspace directory (required for file tools)
 * @param options.model - LLM model name override
 * @param options.maxLoops - Maximum execution steps (default 30)
 * @param options.extraTools - Additional tools to include
 * @param options.systemPrompt - Override system prompt (replaces V1/V2 default)
 * @param options.soulPrompt - Optional soul.md content to append to system prompt
 * @param options.extraTools - Additional tools to inject
 */
/** Tools that subagents / teammates must NOT have access to. */
export const BLOCKED_SUBORDINATE_TOOLS = new Set([
  'task',
  'create_agent',
  'persist_agent',
  'create_skill',
  'persist_skill',
  'promote_feature',
  'enter_plan_mode',
  'exit_plan_mode',
  'vault',  // 只有 Master Agent 可以写入资产总结
]);

// ---------------------------------------------------------------------------
// Tiered tool loading — reduce prompt tokens by only sending core tools initially
// ---------------------------------------------------------------------------

/** Tier 1: always included in LLM API calls (~17 tools). */
export const TIER1_TOOL_NAMES = new Set([
  // Navigation
  'read', 'ls', 'glob', 'grep',
  // Implementation
  'code_write', 'code_edit', 'bash',
  // Knowledge
  'web_search', 'web_fetch', 'semantic_search',
  // Planning & interaction
  'enter_plan_mode', 'exit_plan_mode', 'ask_user_question',
  // Task management
  'todo_write', 'todo_read', 'task',
  // Memory
  'memory',
]);

/** Tier 2: on-demand tool groups activated by keyword or tool-call triggers. */
export const TIER2_TOOL_GROUPS: ToolTierGroup[] = [
  {
    id: 'extended-coding',
    tools: ['multi_edit', 'run_tests', 'bash_bg', 'read_document', 'git_commit'],
    triggerKeywords: /(?:test|commit|git|refactor|multi.?edit|document)/i,
    triggerTools: ['code_write', 'code_edit'],
  },
  {
    id: 'python',
    tools: ['execute_code', 'execute_python', 'python_repl', 'check_executor', 'reset_python_env', 'show_python_vars'],
    triggerKeywords: /(?:python|script|execute|run\s*code|data.?analy|jupyter|notebook|pandas|numpy)/i,
    triggerTools: [],
  },
  {
    id: 'media',
    tools: ['analyze_image', 'generate_image', 'edit_image', 'generate_video', 'visualizer', 'browser', 'browse_url'],
    triggerKeywords: /(?:image|video|picture|photo|screenshot|visual|chart|diagram|browser|browse|url|website)/i,
    triggerTools: [],
  },
  {
    id: 'desktop',
    tools: ['automation', 'screenshot', 'mouse_click', 'keyboard_type', 'keyboard_hotkey', 'mouse_move'],
    triggerKeywords: /(?:automat|desktop|click|screenshot|gui|mouse|keyboard|screen|button)/i,
    triggerTools: [],
  },
  {
    id: 'skills',
    tools: ['discover_skills', 'read_skill_resource', 'store_code_pattern'],
    triggerKeywords: /(?:skill|pattern|template|recipe)/i,
    triggerTools: [],
  },
  {
    id: 'blackboard',
    tools: ['blackboard_read', 'blackboard_write'],
    triggerKeywords: /(?:blackboard|shared.?state|team)/i,
    triggerTools: ['task'],
  },
  {
    id: 'vault',
    tools: ['vault'],
    triggerKeywords: /(?:vault|asset|知识库|制品|复用|reuse|artifact|epic.?summar|graph|manifest)/i,
    triggerTools: [],
  },
];

export function createRebuilDAgent(options?: {
  workspace?: string;
  projectId?: string;
  model?: string;
  maxLoops?: number;
  extraTools?: BaseTool[];
  systemPrompt?: string;
  soulPrompt?: string;
  poolTags?: string[];
  /** Tool names to exclude from the agent's tool set. */
  excludeTools?: Set<string>;
  /** @deprecated No longer used — V1 is the only prompt version */
  descVersion?: string;
}) {
  const ws = options?.workspace;
  const tools: BaseTool[] = [];

  // --- Workspace-scoped tools (instantiated with workspace path) ---
  if (ws) {
    tools.push(new FileReadTool(ws));
    tools.push(new FileListTool(ws));
    tools.push(new CodeWriteTool(ws));
    tools.push(new CodeEditTool(ws));
    tools.push(new MultiEditTool(ws));
    tools.push(new RunCommandTool(ws));
    tools.push(new BashBackgroundTool(ws));
    tools.push(new RunTestsTool(ws));
    tools.push(new GlobTool(ws));
    tools.push(new GrepTool(ws));
    tools.push(new MemoryTool(ws, options?.projectId));
    tools.push(new VaultTool(ws, options?.projectId));
    tools.push(new ReadDocumentTool(ws));
    const blackboard = new Blackboard(crypto.randomUUID(), null);
    tools.push(new BlackboardReadTool(blackboard));
    tools.push(new BlackboardWriteTool(blackboard, 'rebuild'));

    // GitCommitTool
    try {
      tools.push(new GitCommitTool(ws));
    } catch {
      // Git tools may fail if not in a git repo
    }
  }

  // --- Global tools (from registry, cached singletons) ---
  for (const name of GLOBAL_TOOL_NAMES) {
    if (isToolRegistered(name)) {
      try {
        tools.push(...getToolsCached(name));
      } catch {
        // Skip missing tools
      }
    }
  }

  // --- Extra tools ---
  if (options?.extraTools) {
    tools.push(...options.extraTools);
  }

  // --- Exclude tools (for subagents / teammates) ---
  const exclude = options?.excludeTools;
  const finalTools = exclude
    ? tools.filter(t => !exclude.has(t.name))
    : tools;

  // Build system prompt — read from .md file at runtime (single source of truth)
  let systemPrompt = options?.systemPrompt ?? loadPromptFile('rebuild');
  if (options?.soulPrompt) {
    systemPrompt += `\n\n## Agent Soul\n\n${options.soulPrompt}`;
  }

  return new BaseAgent({
    name: 'rebuild',
    systemPrompt,
    tools: finalTools,
    maxLoops: options?.maxLoops ?? 30,
    model: options?.model ?? process.env.LLM_MODEL_NAME ?? 'glm-5',
    poolTags: options?.poolTags,
    lazyModules: loadLazyModules(),
    tier1Tools: TIER1_TOOL_NAMES,
    tier2Groups: TIER2_TOOL_GROUPS,
  });
}
