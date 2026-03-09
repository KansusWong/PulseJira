import { BaseAgent } from '@/lib/core/base-agent';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { getTemplate, resolvePromptTemplate } from '@/lib/config/agent-templates';
import { formatSkillsForPrompt } from '@/lib/skills/skill-loader';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { DEVELOPER_PROMPT } from './prompts/system';
import type { BaseTool } from '@/lib/core/base-tool';
import type { SkillDefinition } from '@/lib/skills/types';
import type OpenAI from 'openai';

/**
 * Creates a Developer agent that writes code via a ReAct loop.
 *
 * The agent explores the codebase, generates code, runs tests, and commits.
 * Tools are injected by the caller (typically workspace-scoped tools from sandbox).
 * The loop exits when `finish_implementation` is called.
 */
export function createDeveloperAgent(options: {
  model?: string;
  specialization?: string;
  taskDescription?: string;
  context?: string;
  tools: BaseTool[];
  skills?: SkillDefinition[];
  maxLoops?: number;
  initialMessages?: OpenAI.Chat.ChatCompletionMessageParam[];
}) {
  const override = loadAgentConfig('developer');
  const template = getTemplate('developer');
  const soul = override.soul ?? loadSoul('developer');

  const basePrompt = template
    ? resolvePromptTemplate(template.promptTemplate, {
        specialization: options.specialization || 'fullstack',
        task_description: options.taskDescription || '',
        context: options.context || '',
      })
    : override.systemPrompt || DEVELOPER_PROMPT;

  let systemPrompt = mergeSoulWithPrompt(soul, basePrompt);

  // Inject skill instructions into the prompt
  if (options.skills && options.skills.length > 0) {
    systemPrompt += formatSkillsForPrompt(options.skills);
  }

  return new BaseAgent({
    name: 'developer',
    systemPrompt,
    tools: options.tools,
    exitToolName: 'finish_implementation',
    maxLoops: options.maxLoops ?? override.maxLoops ?? 20,
    model: options.model ?? override.model,
    initialMessages: options.initialMessages,
  });
}

registerAgentFactory('developer', createDeveloperAgent as any);
