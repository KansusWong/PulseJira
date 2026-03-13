/**
 * TaskTool — creates independent sub-agents to handle delegated work.
 *
 * Replaces the SpawnSubAgentTool and the entire DM→Architect team pipeline.
 * Supports three input formats:
 *   - string: single task description
 *   - object: single task with optional subagent
 *   - array: parallel batch of tasks
 *
 * Auto-matches subagents from the SubagentRegistry when available.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { BaseAgent } from '../core/base-agent';
import type { ToolContext } from '../core/tool-context';
import { getTools } from './tool-registry';
import { selectDesc } from './tool-desc-version';
import { SubagentRegistry } from './subagent-registry';
import type { SubagentDefinition } from './subagent-registry';

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const TASK_DESC_V1 = `Create independent sub-agents to handle delegated tasks.
Supports three input formats:
  - String: single task description (e.g., tasks: "review auth.ts")
  - Object: {task: "...", subagent: "code-reviewer"} for explicit subagent
  - Array: [{task: "...", subagent: "..."}, ...] for parallel execution
Sub-agents have their own context window and cannot see your conversation.
If a .agents/ directory exists with subagent definitions, the best-matching
subagent is selected automatically based on keyword scoring.
Max 5 concurrent sub-agents. Sub-agents cannot spawn further sub-agents.`;

const TASK_DESC_V2 = 'Delegate tasks to sub-agents. Supports string, object, or array input. Auto-matches subagents.';

// ---------------------------------------------------------------------------
// Schema — accepts flexible input formats
// ---------------------------------------------------------------------------

const schema = z.object({
  tasks: z.union([
    z.string(),                      // Single task: "review auth.ts"
    z.record(z.unknown()),           // Single task dict: {task: "...", subagent: "..."}
    z.array(z.record(z.unknown())),  // Batch: [{task: "...", subagent: "..."}, ...]
  ]).describe('Task(s) to delegate. String for single task, object or array for structured tasks.'),
  subagent: z.string().optional().describe('Explicit subagent name (overrides auto-matching)'),
  max_loops: z.number().optional().default(10).describe('Max execution steps per sub-agent (default 10)'),
});

type Input = z.infer<typeof schema>;

/** Internal task config after parsing. */
interface TaskConfig {
  task: string;
  subagent: string | null;
  prompt: string;
}

/** Tools that sub-agents should NOT have access to. */
const BLOCKED_SUB_TOOLS = new Set([
  'task',
  'create_agent',
  'create_sub_agent',
  'persist_agent',
  'enter_plan_mode',
  'exit_plan_mode',
]);

/** Default tools available to sub-agents. */
const DEFAULT_SUB_TOOLS = [
  'read', 'ls', 'glob', 'grep', 'web_search',
  'todo_write', 'todo_read',
  'search_vision_knowledge', 'search_decisions',
  'search_code_artifacts', 'search_code_patterns',
  'rag_retrieve', 'discover_skills', 'read_skill_resource',
];

/** Concurrency limiter. */
let activeSubAgents = 0;
const MAX_CONCURRENT = 5;

// ---------------------------------------------------------------------------
// Task parsing
// ---------------------------------------------------------------------------

/**
 * Parse the flexible `tasks` input into a uniform TaskConfig array.
 */
function _parseTasks(tasks: unknown, defaultSubagent?: string): TaskConfig[] {
  // String: single task
  if (typeof tasks === 'string') {
    return [{
      task: tasks,
      subagent: defaultSubagent || null,
      prompt: tasks,
    }];
  }

  // Object: single task dict
  if (tasks && typeof tasks === 'object' && !Array.isArray(tasks)) {
    const t = tasks as Record<string, unknown>;
    const taskStr = String(t.task || t.description || t.prompt || '');
    return [{
      task: taskStr,
      subagent: (t.subagent as string) || defaultSubagent || null,
      prompt: String(t.prompt || taskStr),
    }];
  }

  // Array: batch of tasks
  if (Array.isArray(tasks)) {
    return tasks.map((item: any) => {
      if (typeof item === 'string') {
        return { task: item, subagent: defaultSubagent || null, prompt: item };
      }
      const taskStr = String(item.task || item.description || item.prompt || '');
      return {
        task: taskStr,
        subagent: (item.subagent as string) || defaultSubagent || null,
        prompt: String(item.prompt || taskStr),
      };
    });
  }

  return [];
}

// ---------------------------------------------------------------------------
// TaskTool
// ---------------------------------------------------------------------------

export class TaskTool extends BaseTool<Input, string> {
  name = 'task';
  description = selectDesc(TASK_DESC_V1, TASK_DESC_V2);
  schema = schema;

  constructor() {
    super();
    this.description = selectDesc(TASK_DESC_V1, TASK_DESC_V2);
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    // Parse tasks
    const configs = _parseTasks(input.tasks, input.subagent);

    if (configs.length === 0) {
      return 'Error: No valid tasks provided.';
    }

    // Initialize subagent registry
    const wsRoot = ctx?.workspacePath || '.';
    const registry = new SubagentRegistry([wsRoot]);

    // Execute
    if (configs.length === 1) {
      return this._executeSingleTask(configs[0], registry, ctx, input.max_loops || 10);
    }

    return this._executeParallelTasks(configs, registry, ctx, input.max_loops || 10);
  }

  private async _executeSingleTask(
    config: TaskConfig,
    registry: SubagentRegistry,
    ctx?: ToolContext,
    maxLoops = 10,
  ): Promise<string> {
    if (activeSubAgents >= MAX_CONCURRENT) {
      return `Error: Maximum concurrent sub-agents (${MAX_CONCURRENT}) reached. Wait for existing sub-agents to complete.`;
    }

    // Resolve subagent
    const subagentName = config.subagent || registry.matchByDescription(config.task) || null;
    const subagentDef = subagentName ? registry.get(subagentName) : null;

    // Build tools
    const tools = this._resolveTools(subagentDef);

    // Build system prompt
    const systemPrompt = this._buildSystemPrompt(config, subagentDef);

    maxLoops = Math.min(Math.max(maxLoops, 1), 20);

    const agent = new BaseAgent({
      name: `sub-agent-${config.task.replace(/\s+/g, '-').slice(0, 30)}`,
      systemPrompt,
      tools,
      maxLoops,
      model: this._resolveModel(subagentDef),
    });

    activeSubAgents++;
    const startTime = Date.now();

    if (ctx?.reportProgress) {
      ctx.reportProgress(`Sub-agent started: ${config.task.slice(0, 50)}`);
    }

    try {
      const result = await agent.run(config.prompt, {
        workspacePath: ctx?.workspacePath,
        projectId: ctx?.projectId,
        traceId: ctx?.traceId,
      });

      const durationMs = Date.now() - startTime;

      if (ctx?.reportProgress) {
        ctx.reportProgress(`Sub-agent completed: ${config.task.slice(0, 50)} (${(durationMs / 1000).toFixed(1)}s)`);
      }

      return this._formatResult(config, subagentName, result, durationMs);
    } catch (e: any) {
      const durationMs = Date.now() - startTime;
      return `\u3010Task Failed\u3011 (subagent: ${subagentName || 'default'})\nTask: ${config.task.slice(0, 80)}\nDuration: ${(durationMs / 1000).toFixed(1)}s\n\nError: ${e.message}`;
    } finally {
      activeSubAgents--;
    }
  }

  private async _executeParallelTasks(
    configs: TaskConfig[],
    registry: SubagentRegistry,
    ctx?: ToolContext,
    maxLoops = 10,
  ): Promise<string> {
    const results = await Promise.all(
      configs.map(config => this._executeSingleTask(config, registry, ctx, maxLoops))
    );

    return results.join('\n\n---\n\n');
  }

  private _resolveTools(subagentDef?: SubagentDefinition | null): any[] {
    let toolNames: string[];

    if (subagentDef && subagentDef.tools.length > 0) {
      toolNames = subagentDef.tools.filter(t => !BLOCKED_SUB_TOOLS.has(t));
    } else {
      toolNames = DEFAULT_SUB_TOOLS;
    }

    const tools: any[] = [];
    for (const name of toolNames) {
      try {
        const resolved = getTools(name);
        tools.push(...resolved);
      } catch {
        // Tool not registered — skip silently
      }
    }
    return tools;
  }

  private _buildSystemPrompt(config: TaskConfig, subagentDef?: SubagentDefinition | null): string {
    if (subagentDef?.systemPrompt) {
      return subagentDef.systemPrompt;
    }

    return `You are a focused sub-agent tasked with: ${config.task}

Complete the task described below and return a clear, structured result.
Be thorough but concise.

If you cannot complete the task, explain what you found and what remains to be done.`;
  }

  private _resolveModel(subagentDef?: SubagentDefinition | null): string {
    if (subagentDef && subagentDef.model !== 'inherit') {
      return subagentDef.model;
    }
    return process.env.LLM_MODEL_NAME ?? 'glm-5';
  }

  private _formatResult(
    config: TaskConfig,
    subagentName: string | null,
    result: unknown,
    durationMs: number,
  ): string {
    const resultStr = typeof result === 'string'
      ? result
      : JSON.stringify(result, null, 2);

    const header = `\u3010Task Completed\u3011 (subagent: ${subagentName || 'default'})\nTask: ${config.task.slice(0, 80)}\nDuration: ${(durationMs / 1000).toFixed(1)}s`;

    // Truncate large results
    const MAX_RESULT = 10000;
    if (resultStr.length > MAX_RESULT) {
      return `${header}\n\n\u3010Result\u3011\n${resultStr.slice(0, MAX_RESULT)}\n\n...[Result truncated, ${resultStr.length} chars total]`;
    }

    return `${header}\n\n\u3010Result\u3011\n${resultStr}`;
  }
}
