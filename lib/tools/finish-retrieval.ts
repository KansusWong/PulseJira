import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  vision_context: z.string().describe('从愿景知识库检索到的相关上下文（可为空字符串）'),
  past_decisions: z.string().describe('从历史决策中检索到的相关记录（可为空字符串）'),
  code_patterns: z.string().describe('从代码模式库中检索到的相关模式（可为空字符串）'),
  code_artifacts: z.string().describe('从代码工件中检索到的相关实现参考（可为空字符串）'),
  search_summary: z.string().describe('对本次检索结果的简要总结，说明找到了哪些关键信息'),
  confidence: z.enum(['high', 'medium', 'low']).describe('对检索结果完整性的信心评级'),
});

type Input = z.infer<typeof schema>;

/**
 * Knowledge Curator 的退出工具。
 * 当 Curator 完成多跳检索后调用此工具返回结构化上下文包。
 */
export class FinishRetrievalTool extends BaseTool<Input, Input> {
  name = 'finish_retrieval';
  description = '完成知识检索并提交结构化上下文包。当你已经充分搜索了所有相关知识源（愿景、决策、代码模式、代码工件）后调用此工具退出。';
  schema = schema;

  protected async _run(input: Input): Promise<Input> {
    return input;
  }
}
