import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { supabase } from '../db/client';
import { generateEmbedding } from '../services/rag';

const schema = z.object({
  query: z.string().describe('搜索查询文本，用于匹配代码工件（文件、PR、测试结果等）'),
  match_count: z.number().default(5).describe('返回结果数量（默认 5）'),
});

type Input = z.infer<typeof schema>;

interface CodeArtifactMatch {
  id: string;
  task_id: string;
  type: string;
  file_path: string | null;
  content: string | null;
  pr_url: string | null;
  similarity: number;
}

/**
 * 搜索代码工件（Code Artifacts）。
 * 封装 Supabase RPC `match_code_artifacts`，返回与查询语义最相近的代码工件。
 */
export class SearchCodeArtifactsTool extends BaseTool {
  name = 'search_code_artifacts';
  description = '搜索已有的代码工件（文件创建/修改记录、PR、测试结果等），找到与当前需求相关的已有实现参考。';
  schema = schema;

  protected async _run(input: Input): Promise<CodeArtifactMatch[]> {
    const embedding = await generateEmbedding(input.query);
    if (embedding.length === 0) {
      return [];
    }

    const { data, error } = await supabase.rpc('match_code_artifacts', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: input.match_count,
    });

    if (error) {
      throw new Error(`Failed to search code artifacts: ${error.message}`);
    }

    return (data || []).map((d: any) => ({
      id: d.id,
      task_id: d.task_id,
      type: d.type,
      file_path: d.file_path,
      content: d.content,
      pr_url: d.pr_url,
      similarity: d.similarity,
    }));
  }
}
