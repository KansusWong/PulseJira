import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { supabase } from '../db/client';
import { generateEmbedding } from '../services/rag';

const schema = z.object({
  query: z.string().describe('搜索查询文本，用于匹配可复用的代码模式'),
  project_id: z.string().uuid().optional().describe('限定在某个项目内搜索（可选）'),
  match_count: z.number().default(5).describe('返回结果数量（默认 5）'),
});

type Input = z.infer<typeof schema>;

interface CodePatternMatch {
  id: string;
  name: string;
  description: string;
  pattern_type: string;
  content: string;
  language: string | null;
  tags: string[];
  usage_count: number;
  similarity: number;
}

/**
 * 搜索代码模式库（Code Patterns）。
 * 封装 Supabase RPC `match_code_patterns`，返回与查询语义最相近的可复用代码模式。
 */
export class SearchCodePatternsTool extends BaseTool {
  name = 'search_code_patterns';
  description = '搜索可复用的代码模式库，找到项目中已有的架构模式、API 模式、组件模式等。帮助保持代码一致性和复用最佳实践。';
  schema = schema;

  protected async _run(input: Input): Promise<CodePatternMatch[]> {
    const embedding = await generateEmbedding(input.query);
    if (embedding.length === 0) {
      return [];
    }

    const { data, error } = await supabase.rpc('match_code_patterns', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: input.match_count,
      filter_project_id: input.project_id || null,
    });

    if (error) {
      throw new Error(`Failed to search code patterns: ${error.message}`);
    }

    return (data || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      pattern_type: d.pattern_type,
      content: d.content,
      language: d.language,
      tags: d.tags,
      usage_count: d.usage_count,
      similarity: d.similarity,
    }));
  }
}
