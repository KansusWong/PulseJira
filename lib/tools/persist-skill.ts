import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import { getDynamicSkill } from './create-skill';
import { registerSkill } from '@/lib/skills/skill-registry';
import { scanResources } from '@/lib/skills/skill-loader';
import type { SkillDefinition } from '@/lib/skills/types';

const PersistSkillInputSchema = z.object({
  skill_id: z.string().describe('The dynamic skill ID returned by create_skill'),
});

type PersistSkillInput = z.infer<typeof PersistSkillInputSchema>;

interface PersistSkillOutput {
  skill_id: string;
  persisted_path: string;
  skill_name: string;
  resources_written: number;
}

/**
 * Persists a dynamically-created skill to disk so it survives restarts.
 *
 * Writes a SKILL.md file to skills/{name}/SKILL.md with YAML frontmatter
 * and instruction body, then writes any attached resource files to their
 * respective subdirectories (references/, scripts/, assets/).
 * Finally re-scans resources and re-registers the skill in the SkillRegistry.
 */
export class PersistSkillTool extends BaseTool<PersistSkillInput, PersistSkillOutput> {
  name = 'persist_skill';
  description = '将动态创建的临时 Skill 持久化到磁盘。生成 SKILL.md 文件及其资源文件，使其成为系统的永久组成部分，后续所有对话/项目可调用。';
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

    // Build resources config block for frontmatter (if present)
    let resourcesBlock = '';
    if (definition.resourceConfig) {
      const lines: string[] = [];
      if (definition.resourceConfig.inject_references != null) {
        lines.push(`  inject_references: ${definition.resourceConfig.inject_references}`);
      }
      if (definition.resourceConfig.max_inject_size != null) {
        lines.push(`  max_inject_size: ${definition.resourceConfig.max_inject_size}`);
      }
      if (lines.length > 0) {
        resourcesBlock = `resources:\n${lines.join('\n')}\n`;
      }
    }

    const skillMdContent = `---
name: ${definition.name}
description: ${definition.description}
version: 0.1.0
tags: ${tagsStr}
${resourcesBlock}---

${definition.instructions}
`;

    const skillPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillPath, skillMdContent, 'utf-8');

    // Write resource files to subdirectories
    let resourcesWritten = 0;
    if (definition.resources) {
      const resourceGroups = [
        { dirName: 'references', files: definition.resources.references },
        { dirName: 'scripts', files: definition.resources.scripts },
        { dirName: 'assets', files: definition.resources.assets },
      ];

      for (const { dirName, files } of resourceGroups) {
        if (!files || files.length === 0) continue;
        const subDir = path.join(skillDir, dirName);
        fs.mkdirSync(subDir, { recursive: true });

        for (const file of files) {
          const fileName = path.basename(file.path);
          const filePath = path.join(subDir, fileName);
          fs.writeFileSync(filePath, file.content, 'utf-8');
          resourcesWritten++;
        }
      }
    }

    // Mark as persistent
    definition.persistent = true;

    // Re-scan resources from disk for accurate metadata
    const scannedResources = scanResources(skillDir);

    // Build resourceConfig with defaults
    const resourceConfig = definition.resourceConfig
      ? {
          inject_references: definition.resourceConfig.inject_references === true,
          max_inject_size: typeof definition.resourceConfig.max_inject_size === 'number'
            ? definition.resourceConfig.max_inject_size
            : 50_000,
        }
      : { inject_references: false, max_inject_size: 50_000 };

    // Re-register with the local source path and scanned resources
    const skillDef: SkillDefinition = {
      id: definition.name, // Use clean name as ID for persisted skills
      name: definition.name,
      description: definition.description,
      version: '0.1.0',
      tools: [],
      tags: definition.tags,
      instructions: definition.instructions,
      source: 'local',
      localPath: skillDir,
      resourceConfig,
      ...(scannedResources ? { resources: scannedResources } : {}),
    };
    registerSkill(skillDef);

    return {
      skill_id: input.skill_id,
      persisted_path: skillPath,
      skill_name: definition.name,
      resources_written: resourcesWritten,
    };
  }
}
