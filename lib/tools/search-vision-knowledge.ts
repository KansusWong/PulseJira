import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { supabase } from '../db/client';
import { generateEmbedding } from '../services/rag';

const schema = z.object({
  query: z.string().describe('搜索查询文本，用于匹配愿景知识库中的相关内容'),
  match_count: z.number().default(3).describe('返回结果数量（默认 3）'),
});

type Input = z.infer<typeof schema>;

interface VisionMatch {
  content: string;
  similarity: number;
}

/**
 * 搜索愿景知识库（Vision Knowledge）。
 * 封装 Supabase RPC `match_vision_knowledge`，返回与查询语义最相近的愿景片段。
 */
export class SearchVisionKnowledgeTool extends BaseTool {
  name = 'search_vision_knowledge';
  description = '搜索项目愿景知识库，返回与查询最相关的愿景片段。用于了解项目方向、核心理念和长期目标。';
  schema = schema;

  protected async _run(input: Input): Promise<VisionMatch[]> {
    const embedding = await generateEmbedding(input.query);
    if (embedding.length === 0) {
      return [];
    }

    const { data, error } = await supabase.rpc('match_vision_knowledge', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: input.match_count,
    });

    if (error) {
      throw new Error(`Failed to search vision knowledge: ${error.message}`);
    }

    return (data || []).map((d: any) => ({
      content: d.content,
      similarity: d.similarity,
    }));
  }
}
