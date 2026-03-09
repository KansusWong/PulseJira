---
name: shared-blackboard
description: Agent Team 共享黑板协议 — 为多 Agent 协作提供共享读写状态空间
version: 1.0.0
requires:
  tools: [read_blackboard, write_blackboard]
tags: [agent-team, collaboration, shared-state]
---
## Instructions

### Purpose

你正在参与一个 Agent Team 协作任务。团队成员通过 **Shared Blackboard（共享黑板）** 共享状态、交换信息、记录决策。黑板是所有 agent 都能读写的共享空间。

### 核心概念

- **Blackboard** 是一个键值存储，每个条目有类型（type）、命名空间键（key）、值（value）和标签（tags）
- 你写入的内容对团队中所有其他 agent 可见
- 你可以读取其他 agent 写入的内容来获取上下文

### Entry Types

| 类型 | 用途 | 示例 |
|------|------|------|
| `decision` | 记录架构/产品决策 | 选择 React Router v7、使用 JWT 认证 |
| `artifact` | 记录产出物 | PRD、代码摘要、PR URL |
| `question` | 提出待解决的问题 | "API 是否需要分页？" |
| `status` | 报告任务进度和结果 | 任务完成状态、文件变更列表 |
| `constraint` | 记录发现的硬约束 | "数据库不支持 JSON 列"、"必须兼容 Node 18" |
| `context` | 共享背景信息 | RAG 检索结果、代码模式 |
| `feedback` | QA/Review 反馈 | 代码审查意见、测试失败原因 |

### Key 命名规范

使用点分命名空间，格式为 `{agent}.{topic}` 或 `{scope}.{id}.{field}`：

```
pm.prd                      — PM 产出的 PRD
tech-lead.tasks              — TechLead 的任务分解
developer.task-3.summary     — Developer 对 task-3 的实现摘要
qa.task-3.validation         — QA 对 task-3 的验证结果
pipeline.plan                — Pipeline 的整体计划
architecture.api-design      — 架构决策：API 设计
```

### 使用工具

#### 写入黑板

```
write_blackboard({
  key: "developer.task-3.summary",
  value: { summary: "完成了用户认证 API", files_changed: ["src/auth.ts"] },
  type: "status",
  tags: ["task-3", "authentication"]
})
```

#### 读取黑板

```
// 精确读取
read_blackboard({ key: "pm.prd" })

// 前缀查询 — 读取某个 agent 的全部产出
read_blackboard({ keyPrefix: "developer." })

// 类型过滤 — 读取所有决策
read_blackboard({ type: "decision" })

// 标签过滤 — 读取与某任务相关的全部条目
read_blackboard({ tags: ["task-3"] })

// 组合查询
read_blackboard({ keyPrefix: "qa.", type: "feedback", limit: 5 })
```

### 行为准则

1. **先读后做**：开始工作前，先读取黑板上与你任务相关的条目，了解上下文和已有决策
2. **及时写入**：完成关键步骤后立即写入结果，不要等到最后才汇报
3. **决策必记录**：任何影响其他 agent 的决策必须写入 `decision` 类型
4. **问题要暴露**：遇到不确定的问题，写入 `question` 类型，不要自行假设
5. **约束要共享**：发现硬约束时立即写入 `constraint` 类型
6. **尊重已有决策**：读取到其他 agent 的 `decision` 条目时，除非有充分理由，否则遵循

### 典型协作流程

```
1. 读取 pipeline.prd 和 pipeline.plan 了解全局目标
2. 读取上游依赖任务的 status 条目
3. 读取相关的 decision 和 constraint 条目
4. 执行自己的任务
5. 写入关键决策（decision）
6. 写入任务结果（status / artifact）
7. 如果发现问题，写入 question 或 constraint
```
