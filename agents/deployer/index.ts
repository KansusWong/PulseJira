import { BaseAgent } from '@/lib/core/base-agent';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { getTemplate, resolvePromptTemplate } from '@/lib/config/agent-templates';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { DEPLOYER_PROMPT } from './prompts/system';
import type { BaseTool } from '@/lib/core/base-tool';

/**
 * Creates a Deployer agent that handles auto-merge, deployment, and health checks.
 *
 * Tools are injected by the caller (deploy-specific tools).
 */
export function createDeployerAgent(options: {
  model?: string;
  taskDescription?: string;
  context?: string;
  tools: BaseTool[];
}) {
  const override = loadAgentConfig('deployer');
  const template = getTemplate('deployer');
  const soul = override.soul ?? loadSoul('deployer');

  const basePrompt = template
    ? resolvePromptTemplate(template.promptTemplate, {
        task_description: options.taskDescription || '',
        context: options.context || '',
      })
    : override.systemPrompt || DEPLOYER_PROMPT;

  const systemPrompt = mergeSoulWithPrompt(soul, basePrompt);

  return new BaseAgent({
    name: 'deployer',
    systemPrompt,
    tools: options.tools,
    exitToolName: 'finish_deploy',
    maxLoops: override.maxLoops ?? 15,
    model: options.model ?? override.model,
  });
}

registerAgentFactory('deployer', createDeployerAgent as any);
