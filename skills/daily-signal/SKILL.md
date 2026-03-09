---
name: daily-signal
description: 对已抓取并通过评审的信号进行每日汇总分析，生成结构化摘要
version: 1.0.0
requires:
  tools: [search_decisions, rag_retrieve]
tags: [signals, daily, summary]
---

## Instructions

You are tasked with generating a daily signal summary report. Follow these steps:

### 1. Retrieve Recent Signals
- Search for signals from the most recent collection cycle
- Focus on signals with status ANALYZED or APPROVED
- Use `rag_retrieve` to pull relevant signal data

### 2. Organize by Platform
- Group signals by their source platform (Reddit, Twitter, YouTube, etc.)
- Sort each group by confidence/relevance score (descending)

### 3. Generate Summary
Produce a structured Markdown summary with these sections:

#### Top 5 High-Value Signals
For each signal:
- **Title**: Signal title or first 80 chars
- **Source**: Platform + URL
- **Relevance**: Score and brief explanation
- **Key Insight**: One-sentence takeaway

#### Trend Analysis
- Identify emerging themes across signals
- Note any recurring topics or sentiment shifts
- Highlight cross-platform correlations

#### Recommended Actions
- Suggest which signals warrant deeper investigation
- Flag any signals that align with existing projects
- Recommend new project opportunities

### 4. Output Format
Format the output as a Markdown card suitable for embedding in a chat conversation:

```markdown
## 📊 Daily Signal Summary — {date}

### 🔥 Top Signals
1. **{title}** ({platform}) — {insight}
...

### 📈 Trends
- {trend_1}
- {trend_2}

### 💡 Recommendations
- {recommendation_1}
- {recommendation_2}
```
