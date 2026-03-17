"use client";

import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";

const SAMPLE_CHARTS = `
# Charts 渲染验证

以下展示 12 种 charts 代码块的渲染效果。

---

## 1. Table — 数据表格

\`\`\`charts
{
  "type": "table",
  "title": "竞品功能对比",
  "columns": ["产品", "价格", "核心优势", "市场份额", "评分"],
  "data": [
    ["ChatGPT", "$20/月", "通用对话", "35%", "4.5"],
    ["Claude", "$20/月", "长文本理解", "28%", "4.7"],
    ["Gemini", "$19.99/月", "多模态", "18%", "4.3"],
    ["DeepSeek", "免费", "推理能力", "12%", "4.2"]
  ]
}
\`\`\`

## 2. Bar — 柱状图

\`\`\`charts
{
  "type": "bar",
  "title": "2024 AI 大模型市场份额",
  "data": [
    {"category": "OpenAI", "value": 35},
    {"category": "Anthropic", "value": 28},
    {"category": "Google", "value": 18},
    {"category": "Meta", "value": 12},
    {"category": "其他", "value": 7}
  ]
}
\`\`\`

## 3. Pie — 饼图

\`\`\`charts
{
  "type": "pie",
  "title": "AI 应用场景分布",
  "data": [
    {"category": "代码生成", "value": 32},
    {"category": "文本写作", "value": 25},
    {"category": "数据分析", "value": 18},
    {"category": "客服对话", "value": 15},
    {"category": "图像生成", "value": 10}
  ]
}
\`\`\`

## 4. Line — 折线图

\`\`\`charts
{
  "type": "line",
  "title": "大模型性能演进趋势",
  "xAxis": ["2021", "2022", "2023", "2024", "2025"],
  "series": [
    {"name": "GPT系列", "data": [55, 68, 82, 90, 95]},
    {"name": "Claude系列", "data": [0, 45, 75, 88, 93]},
    {"name": "开源模型", "data": [30, 42, 60, 78, 88]}
  ]
}
\`\`\`

## 5. Metrics — 关键指标

\`\`\`charts
{
  "type": "metrics",
  "title": "核心业务指标",
  "data": [
    {"label": "日活用户", "value": "1.2亿", "change": "+15%", "trend": "up"},
    {"label": "API调用量", "value": "85亿/天", "change": "+42%", "trend": "up"},
    {"label": "平均响应", "value": "1.2s", "change": "-18%", "trend": "down"},
    {"label": "客户满意度", "value": "4.7/5", "change": "+0.3", "trend": "up"},
    {"label": "收入", "value": "$3.4B", "change": "+120%", "trend": "up"},
    {"label": "成本/查询", "value": "$0.003", "change": "-35%", "trend": "down"}
  ]
}
\`\`\`

## 6. Comparison — 对比表

\`\`\`charts
{
  "type": "comparison",
  "title": "GPT-4o vs Claude Opus 对比",
  "items": [
    {"dimension": "推理能力", "GPT-4o": "优秀", "Claude Opus": "优秀"},
    {"dimension": "长文本处理", "GPT-4o": "128K", "Claude Opus": "200K"},
    {"dimension": "代码生成", "GPT-4o": "强", "Claude Opus": "极强"},
    {"dimension": "价格(输入)", "GPT-4o": "$2.50/M", "Claude Opus": "$15/M"},
    {"dimension": "安全性", "GPT-4o": "高", "Claude Opus": "极高"},
    {"dimension": "多模态", "GPT-4o": "支持", "Claude Opus": "支持"}
  ]
}
\`\`\`

## 7. Timeline — 时间线

\`\`\`charts
{
  "type": "timeline",
  "title": "AI 发展里程碑",
  "data": [
    {"period": "2020.06", "events": "GPT-3 发布", "revenue": "开启大模型时代"},
    {"period": "2022.11", "events": "ChatGPT 发布", "revenue": "AI 爆发元年"},
    {"period": "2023.03", "events": "GPT-4 发布", "revenue": "多模态突破"},
    {"period": "2023.07", "events": "Claude 2 发布", "revenue": "长文本标杆"},
    {"period": "2024.03", "events": "Claude 3 Opus", "revenue": "性能新高"},
    {"period": "2025.01", "events": "AI Agent 普及", "revenue": "自主执行时代"}
  ]
}
\`\`\`

## 8. Mindmap — 思维导图

\`\`\`charts
{
  "type": "mindmap",
  "title": "AI 产品核心竞争力",
  "root": "竞争优势",
  "children": [
    {"name": "技术壁垒", "children": [
      {"name": "模型能力", "children": ["推理能力", "上下文长度", "多模态"]},
      {"name": "基础设施", "children": ["自研芯片", "分布式训练"]}
    ]},
    {"name": "产品生态", "children": [
      {"name": "开发者工具", "children": ["API", "SDK", "插件市场"]},
      {"name": "应用平台", "children": ["企业版", "消费者版"]}
    ]},
    {"name": "数据飞轮", "children": ["用户反馈", "RLHF", "合成数据"]}
  ]
}
\`\`\`

## 9. Flowchart — 流程图

\`\`\`charts
{
  "type": "flowchart",
  "title": "AI 模型选型决策",
  "nodes": [
    {"id": "start", "label": "评估需求", "description": "明确业务场景和预算", "children": ["cost", "perf"]},
    {"id": "cost", "label": "成本敏感?", "children": ["opensource", "cloud"]},
    {"id": "perf", "label": "性能优先?", "children": ["cloud", "custom"]},
    {"id": "opensource", "label": "开源方案", "description": "Llama / Mistral / Qwen"},
    {"id": "cloud", "label": "云端 API", "description": "OpenAI / Anthropic / Google"},
    {"id": "custom", "label": "定制训练", "description": "私有数据微调"}
  ]
}
\`\`\`

## 10. Radar — 雷达图

\`\`\`charts
{
  "type": "radar",
  "title": "多维能力评估",
  "dimensions": ["推理", "代码", "写作", "数学", "安全", "速度"],
  "series": [
    {"name": "GPT-4o", "data": [9, 8, 8, 9, 7, 9]},
    {"name": "Claude Opus", "data": [9, 9, 9, 8, 9, 7]},
    {"name": "Gemini Ultra", "data": [8, 7, 7, 9, 7, 8]}
  ]
}
\`\`\`

## 11. Summary — 核心洞察

\`\`\`charts
{
  "type": "summary",
  "title": "研究核心结论",
  "insights": [
    {"title": "AI 大模型市场进入成熟期", "description": "头部厂商格局基本确立，OpenAI、Anthropic、Google 三强鼎立，占据 80%+ 市场份额"},
    {"title": "Agent 是下一个增长点", "description": "自主执行能力成为核心竞争力，2025 年 Agent 相关收入预计占比超过 30%"},
    {"title": "开源生态快速追赶", "description": "Llama、Qwen 等开源模型与闭源差距缩小至 5-10%，企业自部署需求旺盛"},
    {"title": "安全与合规成为关键壁垒", "description": "监管趋严背景下，安全合规能力成为 ToB 市场核心竞争要素"}
  ]
}
\`\`\`

## 12. Rating — 评分评级

\`\`\`charts
{
  "type": "rating",
  "title": "综合评级",
  "ratings": [
    {"dimension": "推荐指数", "score": 4, "max": 5, "note": "综合表现优秀"},
    {"dimension": "投资价值", "score": 5, "max": 5, "note": "高速增长赛道"},
    {"dimension": "技术成熟度", "score": 4, "max": 5, "note": "核心技术已验证"},
    {"dimension": "风险等级", "level": "中", "note": "监管政策不确定性"},
    {"dimension": "竞争壁垒", "level": "高", "note": "技术+数据+资金三重壁垒"}
  ]
}
\`\`\`

---

以上为全部 12 种 Charts 类型的渲染测试。
`;

export default function ChartsDemoPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <MarkdownRenderer content={SAMPLE_CHARTS} />
      </div>
    </div>
  );
}
