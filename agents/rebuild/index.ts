/**
 * RebuilD Agent — single autonomous software engineering agent.
 *
 * Replaces all previous agents (planner, analyst, reviewer, developer,
 * deployer, decision-maker, architect, chat-assistant) with a single
 * agent backed by a comprehensive tool set.
 */

import { BaseAgent } from '@/lib/core/base-agent';
import type { BaseTool } from '@/lib/core/base-tool';
import { getTools, isToolRegistered } from '@/lib/tools/index';
import { REBUILD_SYSTEM_PROMPT_V1, REBUILD_SYSTEM_PROMPT_V2 } from './prompts/system';
import { getToolDescVersion } from '@/lib/tools/tool-desc-version';

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
import { Blackboard } from '@/lib/blackboard';

/** Tools that can be resolved from global registry (no workspace needed). */
const GLOBAL_TOOL_NAMES = [
  'web_search',
  'enter_plan_mode', 'exit_plan_mode', 'ask_user_question',
  'todo_write', 'todo_read',
  'task',
  'memory',
  'rag_retrieve', 'discover_skills', 'read_skill_resource',
  'search_vision_knowledge', 'search_decisions',
  'search_code_artifacts', 'search_code_patterns',
  'store_code_pattern',
];

/**
 * Create a RebuilD agent instance.
 *
 * @param options.workspace - Absolute path to workspace directory (required for file tools)
 * @param options.model - LLM model name override
 * @param options.maxLoops - Maximum execution steps (default 30)
 * @param options.extraTools - Additional tools to include
 * @param options.soulPrompt - Optional soul.md content to append to system prompt
 * @param options.descVersion - Tool description version ('v1' or 'v2', default: auto from global)
 */
export function createRebuilDAgent(options?: {
  workspace?: string;
  model?: string;
  maxLoops?: number;
  extraTools?: BaseTool[];
  soulPrompt?: string;
  poolTags?: string[];
  descVersion?: 'v1' | 'v2';
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
    tools.push(new MemoryTool(ws));
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

  // --- Global tools (from registry) ---
  for (const name of GLOBAL_TOOL_NAMES) {
    if (isToolRegistered(name)) {
      try {
        tools.push(...getTools(name));
      } catch {
        // Skip missing tools
      }
    }
  }

  // --- Extra tools ---
  if (options?.extraTools) {
    tools.push(...options.extraTools);
  }

  // Build system prompt based on version
  const version = options?.descVersion || getToolDescVersion();
  let systemPrompt = version === 'v1' ? REBUILD_SYSTEM_PROMPT_V1 : REBUILD_SYSTEM_PROMPT_V2;
  if (options?.soulPrompt) {
    systemPrompt += `\n\n## Agent Soul\n\n${options.soulPrompt}`;
  }

  return new BaseAgent({
    name: 'rebuild',
    systemPrompt,
    tools,
    maxLoops: options?.maxLoops ?? 30,
    model: options?.model ?? process.env.LLM_MODEL_NAME ?? 'glm-5',
    poolTags: options?.poolTags,
  });
}
