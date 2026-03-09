import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import { getDynamicSkill } from './create-skill';
import { registerSkill } from '@/lib/skills/skill-registry';
import type { SkillDefinition } from '@/lib/skills/types';

const PersistSkillInputSchema = z.object({
  skill_id: z.string().describe('The dynamic skill ID returned by create_skill'),
});

type PersistSkillInput = z.infer<typeof PersistSkillInputSchema>;

interface PersistSkillOutput {
  skill_id: string;
  persisted_path: string;
  skill_name: string;
}

/**
 * Persists a dynamically-created skill to disk so it survives restarts.
 *
 * Writes a SKILL.md file to skills/{name}/SKILL.md with YAML frontmatter
 * and instruction body, then re-registers it in the SkillRegistry.
 */
export class PersistSkillTool extends BaseTool<PersistSkillInput, PersistSkillOutput> {
  name = 'persist_skill';
  description = '将动态创建的临时 Skill 持久化到磁盘。生成 SKILL.md 文件，使其成为系统的永久组成部分，后续所有对话/项目可调用。';
  schema = PersistSkillInputSchema;

  protected async _run(input: PersistSkillInput): Promise<PersistSkillOutput> {
    const definition = getDynamicSkill(input.skill_id);
    if (!definition) {
      throw new Error(`Dynamic skill "${input.skill_id}" not found. Was it created with create_skill?`);
    }

    const skillDir = path.join(process.cwd(), 'skills', definition.name);
    fs.mkdirSync(skillDir, { recursive: true });

    // Build YAML frontmatter
    const tagsStr = definition.tags.length > 0
      ? `[${definition.tags.join(', ')}]`
      : '[]';

    const skillMdContent = `---
name: ${definition.name}
description: ${definition.description}
version: 0.1.0
tags: ${tagsStr}
---

${definition.instructions}
`;

    const skillPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillPath, skillMdContent, 'utf-8');

    // Mark as persistent
    definition.persistent = true;

    // Re-register with the local source path
    const skillDef: SkillDefinition = {
      id: definition.name, // Use clean name as ID for persisted skills
      name: definition.name,
      description: definition.description,
      version: '0.1.0',
      tools: [],
      tags: definition.tags,
      instructions: definition.instructions,
      source: 'local',
      localPath: skillPath,
    };
    registerSkill(skillDef);

    return {
      skill_id: input.skill_id,
      persisted_path: skillPath,
      skill_name: definition.name,
    };
  }
}
