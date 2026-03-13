import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { getSkill } from '@/lib/skills/skill-registry';
import { loadResourceContent } from '@/lib/skills/skill-loader';

const ReadSkillResourceInputSchema = z.object({
  skill_id: z.string().describe('The skill ID (name) to read a resource from'),
  resource_path: z.string().describe('Relative resource path (e.g. "references/editing.md")'),
});

type ReadSkillResourceInput = z.infer<typeof ReadSkillResourceInputSchema>;

interface ReadSkillResourceOutput {
  skill_id: string;
  resource_path: string;
  content: string;
  size_bytes: number;
}

/**
 * Read a resource file belonging to a registered Skill.
 *
 * Security: only files present in the skill's scanned resource manifest
 * are allowed. Content is read via loadResourceContent() which applies
 * prefix whitelist, path traversal, symlink, binary, and size checks.
 */
export class ReadSkillResourceTool extends BaseTool<ReadSkillResourceInput, ReadSkillResourceOutput> {
  name = 'read_skill_resource';
  description = '按需读取 Skill 的资源文件内容（references/、scripts/、assets/ 子目录中的文件）。仅允许读取已注册 Skill 资源清单中存在的文件。';
  schema = ReadSkillResourceInputSchema;

  protected async _run(input: ReadSkillResourceInput): Promise<ReadSkillResourceOutput> {
    const { skill_id, resource_path } = input;

    // 1. Look up skill in registry
    const skill = getSkill(skill_id);
    if (!skill) {
      throw new Error(`Skill "${skill_id}" not found in registry.`);
    }

    // 2. Verify localPath exists
    if (!skill.localPath) {
      throw new Error(`Skill "${skill_id}" has no local path — resource reading is only available for local skills.`);
    }

    // 3. Manifest validation — the resource_path must be in the scanned manifest
    const allResources = [
      ...(skill.resources?.references ?? []),
      ...(skill.resources?.scripts ?? []),
      ...(skill.resources?.assets ?? []),
    ];
    const found = allResources.find((r) => r.path === resource_path);
    if (!found) {
      const available = allResources.map((r) => r.path).join(', ') || '(none)';
      throw new Error(
        `Resource "${resource_path}" not found in skill "${skill_id}" manifest. Available: ${available}`
      );
    }

    // 4. Read content via secure loader
    const content = loadResourceContent(skill.localPath, resource_path);

    return {
      skill_id,
      resource_path,
      content,
      size_bytes: Buffer.byteLength(content, 'utf-8'),
    };
  }
}
