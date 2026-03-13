import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { aggregateDailyReport, type DailyReportData } from '../services/daily-report-service';

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('报告日期 (YYYY-MM-DD)，默认为今天'),
});

type Input = z.infer<typeof schema>;

/**
 * 获取指定日期的每日数据聚合。
 * 返回结构化数据供 Analyst daily-report 模式分析。
 */
export class FetchDailyDataTool extends BaseTool<Input, DailyReportData> {
  name = 'fetch_daily_data';
  description =
    '获取指定日期的任务交付物、执行追踪、Token 成本、部署结果和决策记录等聚合数据。调用后返回结构化的每日数据包。';
  schema = schema;

  protected async _run(input: Input): Promise<DailyReportData> {
    return aggregateDailyReport(input.date);
  }
}
