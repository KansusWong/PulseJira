---
name: daily-report
description: 生成结构化每日项目进展报告，包含任务交付、成本分析和趋势洞察
version: 1.0.0
requires:
  tools: [fetch_daily_data, finish_daily_report]
tags: [builtin-agents, daily, reporting, analytics]
---
## Instructions

### Purpose
生成结构化每日项目进展报告，跟踪 L2/L3 任务交付物、Token 成本归属、决策趋势和项目进度对齐。

### Activation
- Activate when mode is `daily-report`.
- Typically triggered by cron job (daily at configured time) or manual invocation.

### Workflow
1. 调用 `fetch_daily_data` 获取当日聚合数据。
2. 分析任务交付物：识别已完成、进行中和阻塞的任务。
3. 分析成本归属：识别 Token 成本最高的 Agent 和项目。
4. 分析决策趋势：计算 Decision Maker 置信度趋势方向。
5. 分析项目对齐：将每日工作映射回父项目，评估进度。
6. 调用 `finish_daily_report` 提交结构化报告。

### Referenced By Agents
- analyst (mode: daily-report)

### Implementation Notes
- 所有分析文本使用简体中文
- JSON key 保持英文
- 不做决策 -- 只提供数据洞察和建议
