/**
 * Planner Agent — merged from PM + Tech Lead + Orchestrator.
 *
 * Modes:
 * - prd:                Product Manager — single-shot PRD generation
 * - task-plan:          Tech Lead — ReAct loop for task planning
 * - implementation-dag: Orchestrator — ReAct loop for DAG construction
 */

import { BaseAgent } from '@/lib/core/base-agent';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { getTools } from '@/tools';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { getTemplate, resolvePromptTemplate } from '@/lib/config/agent-templates';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { getPlannerPrompt, type PlannerMode } from './prompts/system';
import type { BaseTool } from '@/lib/core/base-tool';

export interface PlannerOptions {
  model?: string;
  mode?: PlannerMode;
  context?: string;
  extraTools?: BaseTool[];
  blackboard?: any;
}

export function createPlannerAgent(options: PlannerOptions = {}) {
  const mode = options.mode || 'implementation-dag';
  const override = loadAgentConfig('planner');
  const soul = override.soul ?? loadSoul('planner');

  // Try template first; fall back to mode-specific prompt
  const template = getTemplate('planner');
  let basePrompt: string;
  if (template) {
    basePrompt = resolvePromptTemplate(template.promptTemplate, {
      context: options.context || '',
      mode,
    });
  } else {
    basePrompt = override.systemPrompt ?? getPlannerPrompt(mode);
  }

  const systemPrompt = mergeSoulWithPrompt(soul, basePrompt);

  switch (mode) {
    case 'prd':
      // Single-shot mode (like old PM agent)
      return new BaseAgent({
        name: 'planner',
        systemPrompt,
        model: options.model ?? override.model,
      });

    case 'task-plan':
      // ReAct with codebase exploration (like old Tech Lead)
      return new BaseAgent({
        name: 'planner',
        systemPrompt,
        tools: getTools('list_files', 'read_file', 'finish_planning'),
        exitToolName: 'finish_planning',
        maxLoops: override.maxLoops ?? 15,
        model: options.model ?? override.model,
      });

    case 'implementation-dag': {
      // ReAct with broader tools (like old Orchestrator)
      const tools = getTools('web_search', 'list_files', 'read_file', 'finish_planning');
      if (options.extraTools) {
        tools.push(...options.extraTools);
      }
      return new BaseAgent({
        name: 'planner',
        systemPrompt,
        tools,
        exitToolName: 'finish_planning',
        maxLoops: override.maxLoops ?? 25,
        model: options.model ?? override.model,
      });
    }
  }
}

registerAgentFactory('planner', createPlannerAgent);
