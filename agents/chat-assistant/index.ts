import { BaseAgent } from '@/lib/core/base-agent';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { getChatAssistantPrompt, getChatAssistantProjectPrompt } from './prompts/system';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { getTools } from '@/lib/tools';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { getEnvironmentContext } from '@/lib/utils/environment';
import type { BaseTool } from '@/lib/core/base-tool';

export function createChatAssistantAgent(options?: {
  model?: string;
  maxLoops?: number;
  /** 'direct' = L1 Q&A (default), 'project' = L2 light project with sub-agent delegation */
  mode?: 'direct' | 'project';
  /** Extra tools injected by the caller (e.g. spawn_sub_agent, list_agents for L2) */
  extraTools?: BaseTool[];
}) {
  const override = loadAgentConfig('chat-assistant');
  const soul = override.soul ?? loadSoul('chat-assistant');
  const mode = options?.mode ?? 'direct';

  const envContext = getEnvironmentContext();
  const defaultPromptFn = mode === 'project' ? getChatAssistantProjectPrompt : getChatAssistantPrompt;
  const basePrompt = override.systemPrompt ?? defaultPromptFn(envContext);
  const systemPrompt = mergeSoulWithPrompt(soul, basePrompt);

  const defaultMaxLoops = mode === 'project' ? 6 : 3;
  const baseTools = getTools('web_search', 'read_file', 'list_files');
  const tools = options?.extraTools
    ? [...baseTools, ...options.extraTools]
    : baseTools;

  return new BaseAgent({
    name: 'chat-assistant',
    systemPrompt,
    tools,
    maxLoops: options?.maxLoops ?? override.maxLoops ?? defaultMaxLoops,
    model: options?.model ?? override.model ?? process.env.LLM_MODEL_NAME ?? 'gpt-4o',
  });
}

registerAgentFactory('chat-assistant', createChatAssistantAgent);
