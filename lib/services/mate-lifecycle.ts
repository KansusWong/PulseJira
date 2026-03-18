/**
 * Mate Lifecycle — wake / hibernate protocol for mate agents.
 *
 * wake():
 *   1. Load MateDefinition (MATE.md persona)
 *   2. Build system prompt with mission context
 *   3. Create BaseAgent with workspace-scoped tools
 *   4. Restore working memory if resuming
 *
 * hibernate():
 *   1. Extract key findings from working memory
 *   2. Clean up working memory drafts
 *   3. Release BaseAgent instance
 *   4. Update mate status → hibernated
 */

import crypto from 'crypto';
import { BaseAgent } from '../core/base-agent';
import type { BaseTool } from '../core/base-tool';
import type { MateDefinition } from '../core/types';
import { Blackboard } from '../blackboard/blackboard';
import { getTools, getToolsCached, isToolRegistered } from '../tools/tool-registry';

// Workspace-scoped tool imports (same pattern as createRebuilDAgent)
import { FileReadTool } from '../tools/fs-read';
import { FileListTool } from '../tools/fs-list';
import { CodeWriteTool } from '../tools/code-write';
import { CodeEditTool } from '../tools/code-edit';
import { MultiEditTool } from '../tools/multi-edit';
import { RunCommandTool, BashBackgroundTool } from '../tools/run-command';
import { RunTestsTool } from '../tools/run-tests';
import { GlobTool } from '../tools/glob';
import { GrepTool } from '../tools/grep';
import { BlackboardReadTool } from '../tools/blackboard-read';
import { BlackboardWriteTool } from '../tools/blackboard-write';
import { MemoryTool } from '../tools/memory';
import { ReadDocumentTool } from '../tools/read-document';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WakeOptions {
  mateDef: MateDefinition;
  missionId: string;
  /** Mission description / context for system prompt. */
  missionContext: string;
  /** The mate's specific task assignment. */
  taskDescription: string;
  /** Shared mission blackboard. */
  blackboard: Blackboard;
  /** Workspace root path. */
  workspace?: string;
  projectId?: string;
  /** Max ReAct loops for this mate. */
  maxLoops?: number;
  /** Model override (defaults to mate definition or env). */
  model?: string;
}

export interface AwakenedMate {
  agent: BaseAgent;
  mateDef: MateDefinition;
  missionId: string;
}

// ---------------------------------------------------------------------------
// Tools that mates should NOT have
// ---------------------------------------------------------------------------

const BLOCKED_MATE_TOOLS = new Set([
  'task',               // Mates can't spawn sub-agents
  'create_agent',
  'persist_agent',
  'create_skill',
  'persist_skill',
  'promote_feature',
  'enter_plan_mode',
  'exit_plan_mode',
]);

/** Global tools available to mates (subset of rebuild agent's globals). */
const MATE_GLOBAL_TOOLS = [
  'web_search',
  'web_fetch',
  'semantic_search',
  'discover_skills',
  'read_skill_resource',
];

// ---------------------------------------------------------------------------
// Wake
// ---------------------------------------------------------------------------

/**
 * Wake a mate agent: build system prompt, assemble tools, create BaseAgent.
 */
export function wakeMate(options: WakeOptions): AwakenedMate {
  const { mateDef, missionId, missionContext, taskDescription, blackboard, workspace } = options;

  // --- Assemble tools ---
  const tools = buildMateTools(mateDef, blackboard, workspace, options.projectId);

  // --- Build system prompt ---
  const systemPrompt = buildMateSystemPrompt(mateDef, missionContext, taskDescription);

  // --- Resolve model ---
  const model = options.model
    || (mateDef.model !== 'inherit' ? mateDef.model : undefined)
    || process.env.LLM_MODEL_NAME
    || 'glm-5';

  const agent = new BaseAgent({
    name: `mate-${mateDef.name}`,
    systemPrompt,
    tools,
    maxLoops: options.maxLoops ?? 15,
    model,
  });

  return { agent, mateDef, missionId };
}

// ---------------------------------------------------------------------------
// Hibernate (lightweight — no DB writes yet, that's Phase 2.5)
// ---------------------------------------------------------------------------

/**
 * Hibernate a mate: release agent, mark status.
 * In the future this will also persist key findings to vault.
 */
export function hibernateMate(_mate: AwakenedMate): void {
  // BaseAgent has no explicit destroy — GC handles cleanup.
  // Future: extract working memory → vault artifact.
}

// ---------------------------------------------------------------------------
// Tool assembly
// ---------------------------------------------------------------------------

function buildMateTools(
  mateDef: MateDefinition,
  blackboard: Blackboard,
  workspace?: string,
  projectId?: string,
): BaseTool[] {
  const tools: BaseTool[] = [];

  // --- Workspace-scoped tools ---
  if (workspace) {
    tools.push(new FileReadTool(workspace));
    tools.push(new FileListTool(workspace));
    tools.push(new CodeWriteTool(workspace));
    tools.push(new CodeEditTool(workspace));
    tools.push(new MultiEditTool(workspace));
    tools.push(new RunCommandTool(workspace));
    tools.push(new BashBackgroundTool(workspace));
    tools.push(new RunTestsTool(workspace));
    tools.push(new GlobTool(workspace));
    tools.push(new GrepTool(workspace));
    tools.push(new MemoryTool(workspace, projectId));
    tools.push(new ReadDocumentTool(workspace));

    // Shared mission blackboard (not per-agent)
    tools.push(new BlackboardReadTool(blackboard));
    tools.push(new BlackboardWriteTool(blackboard, mateDef.name));
  }

  // --- Global tools ---
  for (const name of MATE_GLOBAL_TOOLS) {
    if (isToolRegistered(name)) {
      try {
        tools.push(...getToolsCached(name));
      } catch { /* skip */ }
    }
  }

  // --- Apply mate-level allow/deny lists ---
  let filtered = tools.filter(t => !BLOCKED_MATE_TOOLS.has(t.name));

  if (mateDef.tools_deny.length > 0) {
    const denySet = new Set(mateDef.tools_deny);
    filtered = filtered.filter(t => !denySet.has(t.name));
  }

  // If mate has explicit allow list, only keep those (plus always-available basics)
  if (mateDef.tools_allow.length > 0) {
    const allowSet = new Set(mateDef.tools_allow);
    // Always allow basic navigation even if not in allow list
    const alwaysAllow = new Set(['read', 'ls', 'glob', 'grep', 'blackboard_read', 'blackboard_write']);
    filtered = filtered.filter(t => allowSet.has(t.name) || alwaysAllow.has(t.name));
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// System prompt construction
// ---------------------------------------------------------------------------

function buildMateSystemPrompt(
  mateDef: MateDefinition,
  missionContext: string,
  taskDescription: string,
): string {
  // If mate has a custom system prompt (from MATE.md body), use it as base
  const basePrompt = mateDef.system_prompt
    ? mateDef.system_prompt
    : `You are ${mateDef.display_name || mateDef.name}, a specialized team member.`;

  return `${basePrompt}

## 当前任务

${taskDescription}

## Mission 背景

${missionContext}

## 协作规范

- 你有独立的 context window，看不到其他 mate 的对话
- 关键进展和结论写入 blackboard（其他 mate 可以读到）
- 你会在对话中收到来自其他 mate 的交接消息，格式为 [来自 XXX 的交接]: ...
- 你也可能收到用户的直接反馈，格式为 [用户反馈]: ...
- 专注完成分配给你的任务，完成后给出清晰的结果总结
- 如果遇到阻塞（缺少信息、依赖未就绪），明确说明并等待`;
}
