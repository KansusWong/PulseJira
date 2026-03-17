import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { registerSkill } from '@/lib/skills/skill-registry';
import { messageBus } from '@/connectors/bus/message-bus';
import type { SkillDefinition } from '@/lib/skills/types';
import type { DynamicSkillDefinition } from '../core/types';

const CreateSkillInputSchema = z.object({
  name: z.string().describe('Unique skill identifier (e.g., "api-versioning")'),
  description: z.string().describe('Short description of what this skill does'),
  instructions: z.string().describe('Detailed instructions in Markdown (equivalent to SKILL.md body)'),
  tags: z.array(z.string()).default([]).describe('Tags for categorization'),
});

type CreateSkillInput = z.infer<typeof CreateSkillInputSchema>;

interface CreateSkillOutput {
  id: string;
  name: string;
  status: 'registered';
}

/** Store of dynamic skill definitions for persistence and cleanup. */
const dynamicSkills = new Map<string, DynamicSkillDefinition>();

export function getDynamicSkill(id: string): DynamicSkillDefinition | undefined {
  return dynamicSkills.get(id);
}

export function getAllDynamicSkills(): DynamicSkillDefinition[] {
  return Array.from(dynamicSkills.values());
}

export function removeDynamicSkill(id: string): boolean {
  return dynamicSkills.delete(id);
}

/**
 * Architect-exclusive tool that creates a new skill at runtime.
 *
 * The skill is registered in the skill registry and can be discovered
 * via discover_skills. By default it is session-level (non-persistent).
 */
export class CreateSkillTool extends BaseTool<CreateSkillInput, CreateSkillOutput> {
  name = 'create_skill';
  description = '动态创建一个新的 Skill。指定名称、描述和详细指令（Markdown 格式）。创建后可通过 discover_skills 发现，并注入到 Agent 提示词中。';
  schema = CreateSkillInputSchema as z.ZodType<CreateSkillInput>;

  protected async _run(input: CreateSkillInput): Promise<CreateSkillOutput> {
    const { name, description, instructions, tags } = input;

    const id = `dynamic-skill-${name}-${crypto.randomUUID().slice(0, 8)}`;

    // Store dynamic definition
    const definition: DynamicSkillDefinition = {
      id,
      name,
      description,
      instructions,
      tags: tags ?? [],
      persistent: false,
    };
    dynamicSkills.set(id, definition);

    // Register in skill registry
    const skillDef: SkillDefinition = {
      id,
      name,
      description,
      version: '0.0.1',
      tools: [],
      tags: tags ?? [],
      instructions,
      coreSkill: false,
      source: 'local',
    };
    registerSkill(skillDef);

    // Publish event
    messageBus.publish({
      from: 'architect',
      channel: 'meta-pipeline',
      type: 'meta_create_skill',
      payload: { id, name, description },
    });

    return { id, name, status: 'registered' };
  }
}
