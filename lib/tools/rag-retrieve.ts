import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { createAnalystAgent } from '@/agents/analyst';

const schema = z.object({
  query: z.string().describe('需要检索的查询内容，描述你需要了解的信息或要解决的问题'),
});

type Input = z.infer<typeof schema>;

interface RetrievalResult {
  vision_context: string;
  past_decisions: string;
  code_patterns: string;
  code_artifacts: string;
  search_summary: string;
  confidence: string;
}

/**
 * RAG 元工具：内部创建 Knowledge Curator 子 Agent 执行多跳检索。
 *
 * 其他 Agent 调用此 tool 即触发完整的多跳检索流程。
 * Knowledge Curator 会自主搜索愿景、决策、代码模式、代码工件四个知识源，
 * 并返回结构化上下文包。
 *
 * 高延迟但上下文质量远优于直接单次检索。
 */
export class RAGRetrieveTool extends BaseTool<Input, RetrievalResult> {
  name = 'rag_retrieve';
  description = '触发深度知识检索。内部启动知识管理员 Agent 执行多跳检索，从愿景库、决策库、代码模式库、代码工件库中搜集全面上下文。适用于需要丰富背景信息的复杂任务。';
  schema = schema;

  protected async _run(input: Input): Promise<RetrievalResult> {
    const curator = createAnalystAgent({ mode: 'retrieve' });

    const result = await curator.run(
      `请为以下查询检索全面的上下文信息：\n\n${input.query}`,
      { logger: console.log }
    );

    // The curator exits via finish_retrieval, so result should be the structured context
    if (result && typeof result === 'object' && result.vision_context !== undefined) {
      return result as RetrievalResult;
    }

    // Fallback: if curator returned text instead of structured output
    return {
      vision_context: '',
      past_decisions: '',
      code_patterns: '',
      code_artifacts: '',
      search_summary: typeof result === 'string' ? result : JSON.stringify(result),
      confidence: 'low',
    };
  }
}
