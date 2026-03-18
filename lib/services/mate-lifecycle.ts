/**
 * Mate Lifecycle — wake / hibernate protocol for mate agents.
 *
 * wake():
 *   1. Load MateDefinition (MATE.md persona)
 *   2. Query vault for historical experience (Phase 3)
 *   3. Build system prompt with mission context + vault insights
 *   4. Create BaseAgent with workspace-scoped tools
 *   5. Restore working memory if resuming
 *
 * hibernate():
 *   1. Extract key findings from agent result
 *   2. Persist key findings to vault_artifacts (Phase 3)
 *   3. Release BaseAgent instance
 *   4. Update mate status → hibernated
 */

import crypto from 'crypto';
import { BaseAgent } from '../core/base-agent';
import type { BaseTool } from '../core/base-tool';
import type { MateDefinition } from '../core/types';
import { Blackboard } from '../blackboard/blackboard';
import { getTools, getToolsCached, isToolRegistered } from '../tools/tool-registry';
import { vaultStore } from './vault-store';

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
  /** Vault insights injected at wake time (for reference during hibernate). */
  vaultInsights?: string;
}

export interface HibernateOptions {
  /** Agent's final result text (used to extract key findings). */
  result?: string;
  /** Project ID for vault persistence. */
  projectId?: string;
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
 * Wake a mate agent: query vault for experience, build system prompt, assemble tools, create BaseAgent.
 */
export async function wakeMate(options: WakeOptions): Promise<AwakenedMate> {
  const { mateDef, missionId, missionContext, taskDescription, blackboard, workspace } = options;

  // --- Assemble tools ---
  const tools = buildMateTools(mateDef, blackboard, workspace, options.projectId);

  // --- Query vault for historical experience ---
  const vaultInsights = await queryVaultExperience(mateDef, options.projectId);

  // --- Build system prompt (with vault insights) ---
  const systemPrompt = buildMateSystemPrompt(mateDef, missionContext, taskDescription, vaultInsights);

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

  return { agent, mateDef, missionId, vaultInsights };
}

// ---------------------------------------------------------------------------
// Hibernate — persist key findings to vault, then release agent
// ---------------------------------------------------------------------------

/**
 * Hibernate a mate: persist key findings to vault, release agent.
 * Fire-and-forget — callers don't need to await this.
 */
export function hibernateMate(mate: AwakenedMate, opts?: HibernateOptions): void {
  // Persist key findings to vault (fire-and-forget)
  if (opts?.result && opts.projectId) {
    persistToVault(mate, opts.result, opts.projectId).catch(err => {
      console.warn(`[mate-lifecycle] Vault persist failed for ${mate.mateDef.name}:`, err.message);
    });
  }
  // BaseAgent has no explicit destroy — GC handles cleanup.
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
  vaultInsights?: string,
): string {
  // If mate has a custom system prompt (from MATE.md body), use it as base
  const basePrompt = mateDef.system_prompt
    ? mateDef.system_prompt
    : `You are ${mateDef.display_name || mateDef.name}, a specialized team member.`;

  const vaultSection = vaultInsights
    ? `\n\n## 历史经验 (Vault)\n\n以下是从 Vault 中检索到的、与你当前任务相关的历史产出。可作为参考：\n\n${vaultInsights}`
    : '';

  return `${basePrompt}

## 当前任务

${taskDescription}

## Mission 背景

${missionContext}${vaultSection}

## 协作规范

- 你有独立的 context window，看不到其他 mate 的对话
- 关键进展和结论写入 blackboard（其他 mate 可以读到）
- 你会在对话中收到来自其他 mate 的交接消息，格式为 [来自 XXX 的交接]: ...
- 你也可能收到用户的直接反馈，格式为 [用户反馈]: ...
- 专注完成分配给你的任务，完成后给出清晰的结果总结
- 如果遇到阻塞（缺少信息、依赖未就绪），明确说明并等待`;
}

// ---------------------------------------------------------------------------
// Vault integration — query historical experience + persist findings
// ---------------------------------------------------------------------------

/**
 * Query vault for artifacts previously produced by this mate or related to its domains.
 * Returns a formatted string for injection into the system prompt, or undefined.
 */
async function queryVaultExperience(mateDef: MateDefinition, projectId?: string): Promise<string | undefined> {
  try {
    const entries = await vaultStore.hydrate(projectId);
    if (entries.length === 0) return undefined;

    // Filter: artifacts created by this mate, or matching its domains
    const domainSet = new Set(mateDef.domains.map(d => d.toLowerCase()));
    const relevant = entries.filter(e => {
      // Created by this mate
      if (e.created_by_agent === mateDef.name) return true;
      // Tag overlap with mate's domains
      if (e.tags?.some(t => domainSet.has(t.toLowerCase()))) return true;
      return false;
    });

    if (relevant.length === 0) return undefined;

    // Take top 5 by reuse_count, then format
    const top = relevant
      .sort((a, b) => (b.reuse_count || 0) - (a.reuse_count || 0))
      .slice(0, 5);

    const lines = top.map(e =>
      `- **${e.name}** (${e.type}): ${e.description?.slice(0, 150) || 'no description'} [reused ${e.reuse_count}x]`
    );

    return lines.join('\n');
  } catch (err) {
    console.warn('[mate-lifecycle] Vault query failed:', (err as Error).message);
    return undefined;
  }
}

/**
 * Persist a mate's key findings to vault after task completion.
 * Extracts a concise summary and stores as a vault artifact.
 */
async function persistToVault(
  mate: AwakenedMate,
  result: string,
  projectId: string,
): Promise<void> {
  // Only persist non-trivial results (> 50 chars)
  if (!result || result.length < 50) return;

  const artifactId = crypto.randomUUID();
  const summary = result.length > 500 ? result.slice(0, 500) + '...' : result;

  vaultStore.persist(projectId, {
    artifact_id: artifactId,
    type: 'doc',
    path: `missions/${mate.missionId}/${mate.mateDef.name}`,
    name: `${mate.mateDef.name} 任务产出`,
    description: summary,
    created_by_epic: mate.missionId,
    created_by_agent: mate.mateDef.name,
    created_at: new Date().toISOString(),
    reuse_count: 0,
    tags: [...mate.mateDef.domains],
    depends_on: [],
    version: 1,
  });
}
