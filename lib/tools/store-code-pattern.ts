import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { supabase } from '../db/client';
import { generateEmbedding } from '../services/rag';

const schema = z.object({
  name: z.string().describe('模式名称（简洁描述性名称）'),
  description: z.string().describe('模式详细描述：用途、适用场景、注意事项'),
  pattern_type: z.enum([
    'file_structure', 'architecture', 'api_pattern', 'component',
    'test_pattern', 'error_handling', 'data_model', 'other',
  ]).describe('模式类型'),
  content: z.string().describe('模式的代码内容或结构描述'),
  language: z.string().optional().describe('编程语言（如 typescript、python）'),
  tags: z.array(z.string()).default([]).describe('标签列表'),
  project_id: z.string().uuid().optional().describe('所属项目 ID'),
  task_id: z.string().uuid().optional().describe('来源任务 ID'),
});

type Input = z.infer<typeof schema>;

interface StoreResult {
  id: string;
  name: string;
}

/**
 * 存储代码模式到模式库。
 * 自动生成 embedding 用于语义搜索。
 */
export class StoreCodePatternTool extends BaseTool {
  name = 'store_code_pattern';
  description = '将一个可复用的代码模式存储到模式库中。包含自动 embedding 生成，后续可通过语义搜索检索。';
  schema = schema;

  protected async _run(input: Input): Promise<StoreResult> {
    const embeddingText = `${input.name} ${input.description} ${input.content}`;
    const embedding = await generateEmbedding(embeddingText);

    const { data, error } = await supabase
      .from('code_patterns')
      .insert({
        name: input.name,
        description: input.description,
        pattern_type: input.pattern_type,
        content: input.content,
        language: input.language || null,
        tags: input.tags,
        project_id: input.project_id || null,
        task_id: input.task_id || null,
        embedding: embedding.length > 0 ? embedding : null,
      })
      .select('id, name')
      .single();

    if (error) {
      throw new Error(`Failed to store code pattern: ${error.message}`);
    }

    return { id: data.id, name: data.name };
  }
}
