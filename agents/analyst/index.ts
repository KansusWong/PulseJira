/**
 * Analyst Agent — merged from Researcher + Blue Team + Critic + Arbitrator + Knowledge Curator.
 *
 * Modes:
 * - research:  Market research scout (ReAct, maxLoops 5, tools: web_search)
 * - advocate:  Business case builder / Blue Team (single-shot, maxLoops 1)
 * - critique:  Risk auditor / Red Team (ReAct, maxLoops 10, tools: web_search)
 * - arbitrate: Decision arbitrator (single-shot, maxLoops 1)
 * - retrieve:  Knowledge curator / multi-hop retrieval (ReAct, maxLoops 8)
 */

import OpenAI from 'openai';
import { BaseAgent } from '@/lib/core/base-agent';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { getTools } from '@/tools';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { SearchVisionKnowledgeTool } from '@/lib/tools/search-vision-knowledge';
import { SearchDecisionsTool } from '@/lib/tools/search-decisions';
import { SearchCodeArtifactsTool } from '@/lib/tools/search-code-artifacts';
import { SearchCodePatternsTool } from '@/lib/tools/search-code-patterns';
import { FinishRetrievalTool } from '@/lib/tools/finish-retrieval';
import { getAnalystPrompt, type AnalystMode } from './prompts/system';

export interface AnalystOptions {
  model?: string;
  mode?: AnalystMode;
  /** OpenAI client override (for red-team LLM pool). */
  client?: OpenAI;
  poolTags?: string[];
  accountId?: string;
  accountName?: string;
  blackboard?: any;
}

export function createAnalystAgent(options: AnalystOptions = {}) {
  const mode = options.mode || 'research';
  const override = loadAgentConfig('analyst');
  const soul = override.soul ?? loadSoul('analyst');
  const prompt = override.systemPrompt ?? getAnalystPrompt(mode);
  const systemPrompt = mergeSoulWithPrompt(soul, prompt);

  switch (mode) {
    case 'research':
      // ReAct with web_search (like old Researcher)
      return new BaseAgent({
        name: 'analyst',
        systemPrompt,
        tools: getTools('web_search'),
        maxLoops: override.maxLoops ?? 5,
        model: options.model ?? override.model,
      });

    case 'advocate':
      // Single-shot (like old Blue Team)
      return new BaseAgent({
        name: 'analyst',
        systemPrompt,
        model: options.model ?? override.model,
      });

    case 'critique':
      // ReAct with web_search (like old Critic) — supports backup LLM
      return new BaseAgent({
        name: 'analyst',
        systemPrompt,
        tools: getTools('web_search'),
        maxLoops: override.maxLoops ?? 10,
        model: options.model ?? override.model,
        client: options.client,
        poolTags: options.poolTags,
        accountId: options.accountId,
        accountName: options.accountName,
      });

    case 'arbitrate':
      // Single-shot (like old Arbitrator)
      return new BaseAgent({
        name: 'analyst',
        systemPrompt,
        model: options.model ?? override.model,
      });

    case 'retrieve':
      // ReAct with retrieval tools (like old Knowledge Curator)
      return new BaseAgent({
        name: 'analyst',
        systemPrompt,
        tools: [
          new SearchVisionKnowledgeTool(),
          new SearchDecisionsTool(),
          new SearchCodeArtifactsTool(),
          new SearchCodePatternsTool(),
          new FinishRetrievalTool(),
        ],
        exitToolName: 'finish_retrieval',
        maxLoops: 8,
        model: options.model ?? override.model,
      });
  }
}

registerAgentFactory('analyst', createAnalystAgent);
