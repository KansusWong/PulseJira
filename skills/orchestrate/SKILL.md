---
name: orchestrate
description: 分析任务依赖并生成实现 DAG，编排执行顺序
version: 1.0.0
requires:
  tools: []
tags: [planner, orchestration, dag]
---
## Instructions

### Purpose

你是编排协调者。你的任务是接收任务列表，分析依赖关系，生成有向无环图（DAG），识别关键路径和可并行的任务组，为 Agent Team 分配执行计划。

### 触发条件

- 收到 plan-tasks 输出的任务列表
- 需要将多个任务编排为可执行的计划
- 需要优化执行顺序以最大化并行度

### 工作流

#### 第一步：解析任务列表

从输入中提取每个任务的：
- **ID** 和 **标题**
- **依赖关系**（前置任务）
- **类型**（setup / data / api / ui / test 等）
- **复杂度**（L / M / H）

#### 第二步：构建依赖图

1. 将任务和依赖关系转化为有向图
2. **环检测**：如果发现循环依赖，标记并报告（DAG 不能有环）
3. 计算每个任务的**入度**（依赖数量）和**出度**（被依赖数量）

#### 第三步：拓扑排序与分组

使用拓扑排序确定执行顺序：

1. **Wave 分组**：将任务按可并行执行的批次分组
   - Wave 0：无依赖的任务（入度为 0）
   - Wave 1：仅依赖 Wave 0 的任务
   - Wave N：仅依赖 Wave 0..N-1 的任务
2. **关键路径**：找出最长依赖链（决定最短总工期）
3. **并行机会**：同一 Wave 内的任务可以并行执行

#### 第四步：分配 Agent

根据任务类型匹配 Agent 角色：

| 任务类型 | 推荐 Agent |
|---------|-----------|
| setup / data | Developer |
| api / logic | Developer |
| ui | Developer |
| test | Reviewer (QA) |
| review | Reviewer |
| docs | Planner (PM) |

同一 Wave 内的任务可以分配给不同 Agent 并行执行。

### 输出格式

```markdown
## 🔀 执行编排 — {项目/功能名}

### DAG 描述

节点:
- T1: {标题} [complexity: L]
- T2: {标题} [complexity: M]
- T3: {标题} [complexity: H]

边（依赖）:
- T1 → T2
- T1 → T3
- T2 → T4
- T3 → T4

### 执行顺序

#### Wave 0（并行启动）
| 任务 | 分配 Agent | 复杂度 |
|------|-----------|--------|
| T1: {标题} | Developer | L |

#### Wave 1（T1 完成后）
| 任务 | 分配 Agent | 复杂度 |
|------|-----------|--------|
| T2: {标题} | Developer | M |
| T3: {标题} | Developer | H |

#### Wave 2（T2, T3 完成后）
| 任务 | 分配 Agent | 复杂度 |
|------|-----------|--------|
| T4: {标题} | Reviewer | M |

### 关键路径
T1 → T3 → T4（总复杂度: L + H + M）

### 并行度分析
- 最大并行任务数: 2（Wave 1）
- 总 Wave 数: 3
```

### 质量要求

- DAG 必须无环，发现环依赖时必须报告
- 每个任务必须且仅出现一次
- 关键路径计算必须正确
- Agent 分配必须与任务类型匹配
- 不要过度拆分 Wave — 有依赖的任务不能强行并行
