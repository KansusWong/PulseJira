/**
 * Reviewer Agent — merged from QA Engineer + Code Reviewer + Supervisor.
 *
 * Modes:
 * - qa:        QA Engineer — validates code, runs tests (ReAct, tools injected, exit: finish_implementation)
 * - review:    Code Reviewer — reviews code changes (ReAct, tools injected, exit: finish_implementation)
 * - supervise: Supervisor — validates agent outputs (ReAct, maxLoops 5, tools: validate_output/read_file/list_files)
 */

import { BaseAgent } from '@/lib/core/base-agent';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { getTools } from '@/tools';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { getTemplate, resolvePromptTemplate } from '@/lib/config/agent-templates';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { getReviewerPrompt, type ReviewerMode } from './prompts/system';
import type { BaseTool } from '@/lib/core/base-tool';
import type OpenAI from 'openai';

export interface ReviewerOptions {
  model?: string;
  mode?: ReviewerMode;
  taskDescription?: string;
  context?: string;
  tools?: BaseTool[];
  maxLoops?: number;
  initialMessages?: OpenAI.Chat.ChatCompletionMessageParam[];
  blackboard?: any;
}

export function createReviewerAgent(options: ReviewerOptions = {}) {
  const mode = options.mode || 'review';
  const override = loadAgentConfig('reviewer');
  const soul = override.soul ?? loadSoul('reviewer');

  // Try template first; fall back to mode-specific prompt
  const template = getTemplate('reviewer');
  let basePrompt: string;
  if (template) {
    basePrompt = resolvePromptTemplate(template.promptTemplate, {
      task_description: options.taskDescription || '',
      context: options.context || '',
      mode,
    });
  } else {
    basePrompt = override.systemPrompt ?? getReviewerPrompt(mode);
  }

  const systemPrompt = mergeSoulWithPrompt(soul, basePrompt);

  switch (mode) {
    case 'qa':
      // QA Engineer — tools injected by caller (workspace-scoped)
      return new BaseAgent({
        name: 'reviewer',
        systemPrompt,
        tools: options.tools || [],
        exitToolName: 'finish_implementation',
        maxLoops: options.maxLoops ?? override.maxLoops ?? 10,
        model: options.model ?? override.model,
        initialMessages: options.initialMessages,
      });

    case 'review':
      // Code Reviewer — tools injected by caller (workspace-scoped)
      return new BaseAgent({
        name: 'reviewer',
        systemPrompt,
        tools: options.tools || [],
        exitToolName: 'finish_implementation',
        maxLoops: options.maxLoops ?? override.maxLoops ?? 10,
        model: options.model ?? override.model,
        initialMessages: options.initialMessages,
      });

    case 'supervise':
      // Supervisor — built-in tools
      return new BaseAgent({
        name: 'reviewer',
        systemPrompt,
        tools: getTools('validate_output', 'read_file', 'list_files'),
        maxLoops: override.maxLoops ?? 5,
        model: options.model ?? override.model,
      });
  }
}

registerAgentFactory('reviewer', createReviewerAgent);
