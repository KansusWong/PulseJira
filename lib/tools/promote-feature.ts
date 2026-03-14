import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { getDynamicSkill } from './create-skill';

const PromoteFeatureInputSchema = z.object({
  project_id: z.string().describe('The project ID containing the feature to promote'),
  feature_description: z.string().describe('Description of the feature to extract and promote'),
  feature_type: z.enum(['skill', 'agent']).describe('Whether to promote as a Skill or Agent'),
  feature_name: z.string().describe('Name for the promoted feature (hyphen-case)'),
});

type PromoteFeatureInput = z.infer<typeof PromoteFeatureInputSchema>;

interface PromoteFeatureOutput {
  status: 'promoted' | 'pending_generation';
  feature_type: 'skill' | 'agent';
  feature_name: string;
  message: string;
  next_step?: string;
}

/**
 * Promotes a project-level feature to a system-level Skill or Agent.
 *
 * For Skills: generates a SKILL.md and calls persist_skill
 * For Agents: generates a soul.md + index.ts and calls persist_agent
 *
 * This tool provides the scaffolding — the Architect agent is expected to
 * fill in the actual content via create_skill/create_agent + persist.
 */
export class PromoteFeatureTool extends BaseTool<PromoteFeatureInput, PromoteFeatureOutput> {
  name = 'promote_feature';
  description = '将项目中验证过的功能模块提升为系统级能力（Skill 或 Agent），使其可被后续所有对话/项目复用。';
  schema = PromoteFeatureInputSchema;

  protected async _run(input: PromoteFeatureInput): Promise<PromoteFeatureOutput> {
    const { project_id, feature_description, feature_type, feature_name } = input;

    if (feature_type === 'skill') {
      // Check if a dynamic skill already matches
      const existing = getDynamicSkill(feature_name);
      if (existing) {
        return {
          status: 'pending_generation',
          feature_type: 'skill',
          feature_name,
          message: `Dynamic skill "${feature_name}" found. Use persist_skill to write it to disk.`,
          next_step: `Call persist_skill with skill_id="${existing.id}"`,
        };
      }

      return {
        status: 'pending_generation',
        feature_type: 'skill',
        feature_name,
        message: `To promote as Skill: first call create_skill with name="${feature_name}" and instructions derived from: ${feature_description}. Then call persist_skill to save permanently.`,
        next_step: `create_skill → persist_skill`,
      };
    }

    if (feature_type === 'agent') {
      return {
        status: 'pending_generation',
        feature_type: 'agent',
        feature_name,
        message: `To promote as Agent: create a subagent by writing agents/subagents/${feature_name}/agent.md with frontmatter (name, description, tools, model) and system prompt body derived from: ${feature_description}.`,
        next_step: `write agents/subagents/${feature_name}/agent.md`,
      };
    }

    return {
      status: 'pending_generation',
      feature_type,
      feature_name,
      message: 'Unknown feature type.',
    };
  }
}
