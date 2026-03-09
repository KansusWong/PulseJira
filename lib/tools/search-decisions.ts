import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { supabase } from '../db/client';
import { generateEmbedding } from '../services/rag';

const schema = z.object({
  query: z.string().describe('搜索查询文本，用于匹配历史决策记录'),
  match_count: z.number().default(5).describe('返回结果数量（默认 5）'),
});

type Input = z.infer<typeof schema>;

interface DecisionMatch {
  decision_rationale: string;
  result_action: any;
  similarity: number;
}

/**
 * 搜索历史决策记录（Past Decisions）。
 * 封装 Supabase RPC `match_decisions`，返回与查询语义最相近的历史决策。
 */
export class SearchDecisionsTool extends BaseTool {
  name = 'search_decisions';
  description = '搜索历史决策记录，返回过去类似需求的决策理由和结果。用于保持决策一致性，避免重复犯错。';
  schema = schema;

  protected async _run(input: Input): Promise<DecisionMatch[]> {
    const embedding = await generateEmbedding(input.query);
    if (embedding.length === 0) {
      return [];
    }

    const { data, error } = await supabase.rpc('match_decisions', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: input.match_count,
    });

    if (error) {
      throw new Error(`Failed to search decisions: ${error.message}`);
    }

    return (data || []).map((d: any) => ({
      decision_rationale: d.decision_rationale,
      result_action: d.result_action,
      similarity: d.similarity,
    }));
  }
}
