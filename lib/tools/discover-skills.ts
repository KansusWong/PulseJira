import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { supabase } from '../db/client';
import { generateEmbedding } from '../services/rag';

const schema = z.object({
  query: z.string().describe('描述你需要的能力或要解决的问题，系统将语义匹配最相关的技能'),
  match_count: z.number().default(5).describe('返回结果数量（默认 5）'),
});

type Input = z.infer<typeof schema>;

interface SkillMatch {
  skill_id: string;
  skill_name: string;
  description: string;
  tags: string[];
  source: string;
  similarity: number;
}

/**
 * 语义搜索技能（Skill Discovery）。
 * 封装 Supabase RPC `match_skills`，基于向量相似度匹配最适合的技能。
 */
export class DiscoverSkillsTool extends BaseTool {
  name = 'discover_skills';
  description = '语义搜索可用技能。描述你要完成的任务或需要的能力，系统将返回最匹配的技能列表，包括技能名称、描述和相关度。';
  schema = schema;

  protected async _run(input: Input): Promise<SkillMatch[]> {
    const embedding = await generateEmbedding(input.query);
    if (embedding.length === 0) {
      return [];
    }

    const { data, error } = await supabase.rpc('match_skills', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: input.match_count,
    });

    if (error) {
      throw new Error(`Failed to discover skills: ${error.message}`);
    }

    return (data || []).map((d: any) => ({
      skill_id: d.skill_id,
      skill_name: d.skill_name,
      description: d.description,
      tags: d.tags,
      source: d.source,
      similarity: d.similarity,
    }));
  }
}
