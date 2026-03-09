import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import { getDynamicAgent } from './create-agent';
import { appendToDynamicRegistry, type DynamicAgentEntry } from '@/lib/config/dynamic-agents';

const PersistAgentInputSchema = z.object({
  agent_id: z.string().describe('The dynamic agent ID returned by create_agent'),
});

type PersistAgentInput = z.infer<typeof PersistAgentInputSchema>;

interface PersistAgentOutput {
  agent_id: string;
  persisted_path: string;
  files_written: string[];
}

/**
 * Persists a dynamically-created agent to disk so it becomes a permanent
 * part of the system (survives restarts).
 *
 * Writes:
 *   agents/{name}/soul.md    — extracted from system_prompt
 *   agents/{name}/index.ts   — factory function boilerplate
 */
export class PersistAgentTool extends BaseTool<PersistAgentInput, PersistAgentOutput> {
  name = 'persist_agent';
  description = '将动态创建的临时 Agent 持久化到磁盘。写入 soul.md 和 index.ts，使其成为系统的永久组成部分。';
  schema = PersistAgentInputSchema;

  protected async _run(input: PersistAgentInput): Promise<PersistAgentOutput> {
    const definition = getDynamicAgent(input.agent_id);
    if (!definition) {
      throw new Error(`Dynamic agent "${input.agent_id}" not found. Was it created with create_agent?`);
    }

    const agentDir = path.join(process.cwd(), 'agents', definition.name);
    fs.mkdirSync(agentDir, { recursive: true });

    // Write soul.md — use the structured soul if available, otherwise fallback
    const soulContent = definition.soul
      || `# ${definition.name} — ${definition.role}\n\n> AI-generated agent by Architect\n\n${definition.system_prompt}`;
    const soulPath = path.join(agentDir, 'soul.md');
    fs.writeFileSync(soulPath, soulContent, 'utf-8');

    // Write index.ts (factory function)
    const toolsStr = definition.tools.map((t) => `'${t}'`).join(', ');
    const indexContent = `import { BaseAgent } from '@/lib/core/base-agent';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { getTools } from '@/tools';
import { loadSoul, mergeSoulWithPrompt } from '../utils';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';

export function create${toPascalCase(definition.name)}Agent(options?: { model?: string }) {
  const override = loadAgentConfig('${definition.name}');
  const soul = override.soul ?? loadSoul('${definition.name}');
  const systemPrompt = mergeSoulWithPrompt(soul, override.systemPrompt || '');

  return new BaseAgent({
    name: '${definition.name}',
    systemPrompt,
    tools: getTools(${toolsStr}),
    maxLoops: override.maxLoops ?? ${definition.max_loops},
    model: options?.model ?? override.model,
  });
}

registerAgentFactory('${definition.name}', create${toPascalCase(definition.name)}Agent);
`;
    const indexPath = path.join(agentDir, 'index.ts');
    fs.writeFileSync(indexPath, indexContent, 'utf-8');

    // Mark as persistent
    definition.persistent = true;

    // Write to the persistent dynamic-registry.json so the agent
    // survives server restarts without manual builtin-agents.ts edits.
    const registryEntry: DynamicAgentEntry = {
      id: definition.name,
      displayName: `[AI] ${definition.name}`,
      role: definition.role,
      runMode: definition.run_mode ?? 'react',
      defaultMaxLoops: definition.max_loops,
      defaultPrompt: definition.system_prompt,
      tools: definition.tools.map((t) => ({ name: t, description: '' })),
      skills: [],
      exitToolName: undefined,
      createdBy: 'architect',
      isAIGenerated: true,
    };
    appendToDynamicRegistry(registryEntry);

    return {
      agent_id: input.agent_id,
      persisted_path: agentDir,
      files_written: [soulPath, indexPath, 'agents/dynamic-registry.json'],
    };
  }
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
