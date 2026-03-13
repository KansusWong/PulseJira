/**
 * CreateSubAgentTool — one-shot worker agent for both simple and medium modes.
 *
 * Unlike CreateAgentTool (which registers a persistent agent with independent
 * context), this tool creates a temporary agent inline, runs it immediately,
 * returns the result, and discards the agent. No registration, no persistence,
 * no team awareness.
 *
 * Tool access is restricted to a safe whitelist to prevent recursion and
 * uncontrolled system modifications.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { BaseAgent } from '../core/base-agent';
import { getTools } from '@/lib/tools/tool-registry';
import { messageBus } from '@/connectors/bus/message-bus';

// Tools that one-shot workers are allowed to use (no spawn/create — prevents recursion)
const SUB_AGENT_ALLOWED_TOOLS = ['web_search', 'read_file', 'list_files'] as const;
type AllowedTool = typeof SUB_AGENT_ALLOWED_TOOLS[number];

const MAX_WORKER_LOOPS = 10;
const DEFAULT_WORKER_LOOPS = 5;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CreateSubAgentInputSchema = z.object({
  name: z.string().describe(
    'A short identifier for this worker (used in logs only, e.g. "data-analyst", "spec-writer").',
  ),
  task: z.string().describe(
    'The task description sent to the worker as its user message. Include all necessary context — the worker has no access to your conversation history.',
  ),
  system_prompt: z.string().describe(
    'System prompt defining the worker\'s role, constraints, and expected output format.',
  ),
  tools: z.array(z.string()).optional().describe(
    `Optional list of tools for the worker. Allowed: ${SUB_AGENT_ALLOWED_TOOLS.join(', ')}. Defaults to all allowed tools if omitted.`,
  ),
  max_loops: z.number().optional().describe(
    `Max reasoning loops for the worker (default: ${DEFAULT_WORKER_LOOPS}, max: ${MAX_WORKER_LOOPS}).`,
  ),
});

type CreateSubAgentInput = z.infer<typeof CreateSubAgentInputSchema>;

interface CreateSubAgentOutput {
  agent_name: string;
  status: 'success' | 'error';
  output: any;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class CreateSubAgentTool extends BaseTool<CreateSubAgentInput, CreateSubAgentOutput> {
  name = 'create_sub_agent';
  description =
    'Create and immediately run a one-shot worker agent for a specialized subtask. ' +
    'Define the worker inline with a custom system prompt and task. The worker runs, ' +
    'returns its result, and is discarded — no registration, no persistence, no team ' +
    'awareness. Use this when pre-registered agents do not cover the specific need. ' +
    'The worker has access only to: web_search, read_file, list_files.';
  schema = CreateSubAgentInputSchema;

  protected async _run(input: CreateSubAgentInput): Promise<CreateSubAgentOutput> {
    const start = Date.now();
    const { name, task, system_prompt, tools: requestedTools, max_loops } = input;

    // --- Validate requested tools against whitelist ---
    const toolNames: AllowedTool[] = requestedTools
      ? this.validateTools(requestedTools)
      : [...SUB_AGENT_ALLOWED_TOOLS];

    const loops = Math.min(max_loops ?? DEFAULT_WORKER_LOOPS, MAX_WORKER_LOOPS);

    try {
      // --- Build tool instances ---
      const workerTools = getTools(...toolNames);

      // --- Create temporary agent (not registered) ---
      const agent = new BaseAgent({
        name: `sub-agent-${name}`,
        systemPrompt: system_prompt,
        tools: workerTools,
        maxLoops: loops,
      });

      // --- Emit start event ---
      messageBus.publish({
        from: 'architect',
        to: `sub-agent-${name}`,
        channel: 'meta-pipeline',
        type: 'sub_agent_start',
        payload: { agent_name: name, task: task.slice(0, 200) },
      });

      // --- Run (pass messageBus logger so steps are visible on the frontend) ---
      const result = await agent.run(task, {
        traceId: undefined,
        logger: async (msg: string) => {
          console.log(msg);
          messageBus.publish({
            from: `sub-agent-${name}`,
            to: 'frontend',
            channel: 'agent-log',
            type: 'agent_log',
            payload: { message: msg },
          });
        },
      });

      // --- Emit completion event ---
      messageBus.publish({
        from: `sub-agent-${name}`,
        to: 'architect',
        channel: 'meta-pipeline',
        type: 'sub_agent_complete',
        payload: { agent_name: name, status: 'success', duration_ms: Date.now() - start },
      });

      return {
        agent_name: name,
        status: 'success',
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error: any) {
      messageBus.publish({
        from: `sub-agent-${name}`,
        to: 'architect',
        channel: 'meta-pipeline',
        type: 'sub_agent_complete',
        payload: { agent_name: name, status: 'error', error: error.message, duration_ms: Date.now() - start },
      });

      return {
        agent_name: name,
        status: 'error',
        output: { error: error.message },
        duration_ms: Date.now() - start,
      };
    }
  }

  /** Validate that all requested tools are in the whitelist. Throws on invalid tools. */
  private validateTools(requested: string[]): AllowedTool[] {
    const allowed = new Set<string>(SUB_AGENT_ALLOWED_TOOLS);
    const invalid = requested.filter(t => !allowed.has(t));
    if (invalid.length > 0) {
      throw new Error(
        `Invalid tools for sub-agent: [${invalid.join(', ')}]. ` +
        `Allowed tools: [${SUB_AGENT_ALLOWED_TOOLS.join(', ')}].`,
      );
    }
    return requested as AllowedTool[];
  }
}
