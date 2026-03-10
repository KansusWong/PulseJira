import { BaseAgent } from '@/lib/core/base-agent';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { getChatAssistantPrompt } from './prompts/system';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { getTools } from '@/lib/tools';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { getEnvironmentContext } from '@/lib/utils/environment';

export function createChatAssistantAgent(options?: {
  model?: string;
  maxLoops?: number;
}) {
  const override = loadAgentConfig('chat-assistant');
  const soul = override.soul ?? loadSoul('chat-assistant');
  const basePrompt = override.systemPrompt ?? getChatAssistantPrompt(getEnvironmentContext());
  const systemPrompt = mergeSoulWithPrompt(soul, basePrompt);

  return new BaseAgent({
    name: 'chat-assistant',
    systemPrompt,
    tools: getTools('web_search', 'read_file', 'list_files'),
    maxLoops: options?.maxLoops ?? override.maxLoops ?? 3,
    model: options?.model ?? override.model ?? process.env.LLM_MODEL_NAME ?? 'gpt-4o',
  });
}

registerAgentFactory('chat-assistant', createChatAssistantAgent);
