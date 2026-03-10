# Architecture Lessons & Research Notes

> 持续记录架构决策过程中的行业调研、讨论结论和设计原则。

---

## 2026-03-10: Single Agent 模式下的 Sub-Agent 机制

### 背景

在开发者模式的三级复杂度（L1/L2/L3）设计中，single_agent 是用户主动选择的结果——无论项目复杂度多高，都在既定 workflow 和当前 agent 下执行。问题是：single_agent 模式是否应该支持临时 spawn sub-agent 来处理复杂子任务？

### 行业调研结论

#### 1. Sub-Agent 与 Team 是两种本质不同的协作模型

| 维度 | Sub-agent (fan-out) | Agent Team |
|------|---------------------|------------|
| 拓扑 | 星型，parent -> N workers -> parent | 网状，lead + peers + mailbox |
| 通信 | 无。worker 之间完全隔离 | 有。mailbox + blackboard 共享状态 |
| 控制权 | parent 全程持有，决定拆分和聚合 | lead 委派，worker 有自主权 |
| 生命周期 | 随 parent 的 tool call 创建和销毁 | 跟随 team 生命周期 |
| 类比 | `Promise.all` / map-reduce | 微服务编排 |

**结论：sub-agent 不是 team 的简化版，而是一种独立的执行模式。它是 single_agent 能力的自然延伸，不是 agent_team 的降级。**

#### 2. Anthropic 多 Agent 研究系统的数据

来源：[How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

- 多 agent 系统比单 agent 的 token 消耗高 **15 倍**
- Opus 4 lead + Sonnet 4 sub-agents 比单 Opus 4 高 **90.2%** 表现
- **token 使用量解释了 80% 的性能差异**——多 agent 的优势本质是"花更多 token 来解决问题"
- 早期错误：简单查询也 spawn 50 个 sub-agent。解决方案：在 prompt 中嵌入显式的 effort scaling 规则

Anthropic 的 effort scaling 规则：

| 任务类型 | sub-agent 数 | tool call 数 |
|---------|-------------|-------------|
| 简单事实查找 | 1 | 3-10 |
| 直接对比 | 2-4 | 每个 10-15 |
| 复杂研究 | 10+ | 不限 |

#### 3. 阈值路由：动态决定单 agent 还是多 agent

来源：[Single-agent or Multi-agent Systems? Why Not Both?](https://arxiv.org/abs/2505.18286) (arXiv 2025)

核心发现：
- 用 LLM rater 评估请求复杂度，低于阈值走单 agent，高于阈值走多 agent
- 随着前沿 LLM 能力提升（长上下文、工具使用、推理），多 agent 相对单 agent 的优势在缩小
- 但对高复杂度任务，多 agent 仍然显著更好
- 编译多 agent 为单 agent + skills 可减少 54% token 用量和 50% 延迟，同时匹配准确度

#### 4. Cognition (Devin) 的反面警告

来源：[Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents)

关键约束：
- Sub-agent 通常只应该被委派**回答一个明确定义的问题**，而不是做需要主 agent 上下文的工作
- Claude Code 的实践：sub-agent 不与主 agent 并行工作，且只被委派"回答问题"而非"写代码"
- 核心原则：**每个 agent 的行动都必须有足够的上下文**
- 2025 年需要多 agent 的任务，2026 年可能单 agent 就能搞定

#### 5. OpenAI Agents SDK 的两种委派模式

来源：[Agent orchestration - OpenAI Agents SDK](https://openai.github.io/openai-agents-python/multi_agent/)

- **Handoffs**（去中心化委派）：agent 把控制权交给另一个 agent，适合路由场景
- **Agents as Tools**（中心化管理）：central agent 把其他 agent 当 tool 调用，适合 sub-agent 场景

**我们的 sub-agent 机制应该采用 "Agents as Tools" 模式，parent agent 始终持有控制权。**

### 设计决策

#### 决策 1：single_agent 内部自适应，用户不感知

用户选择 single_agent 表达的意图是"不要多 agent 协作的复杂性"，但不意味着"只要一个串行的 ReAct 循环"。Sub-agent 对用户应该是透明的。

```
single_agent 内部自适应：
  简单任务 -> 纯 ReAct 循环（当前行为不变）
  中等任务 -> ReAct + 串行 sub-agent（辅助信息收集/验证）
  高复杂任务 -> fan-out 并行 sub-agent -> parent 聚合
```

#### 决策 2：混合路由——pipeline 预判 + agent 运行时自主

- **pipeline 层**做粗粒度预判（类似论文中的 rater），设定预算上限
- **agent 运行时**在预算内自主决定是否 spawn

理由：Anthropic 的经验是纯靠 agent 自主决定会导致"简单任务也 spawn 50 个 sub-agent"。需要外部约束设定预算上限。

```typescript
// pipeline 层预判
const complexity = await assessTaskComplexity(task);
const subAgentBudget = {
  low:    { maxSubAgents: 0, maxTotalLoops: 15 },
  medium: { maxSubAgents: 3, maxTotalLoops: 30 },
  high:   { maxSubAgents: 6, maxTotalLoops: 50 },
}[complexity];
```

#### 决策 3：默认串行，显式请求并行

参考 Cognition 实践："never does work in parallel with the subtask agent"。串行的好处是上下文损失最小——parent 拿到 sub-agent-1 的结果后可以传给 sub-agent-2。并行只在子任务真正独立时才使用。

#### 决策 4：总预算共享 + sub-agent 单次上限

```typescript
spawn_sub_agent({
  task: "...",
  max_loops: 5,    // 单个 sub-agent 上限（硬约束）
})
// parent 总预算 = 30 loops
// 每次 spawn 的 loops 从总预算扣减
// 剩余预算 < 请求的 max_loops 时拒绝 spawn
```

#### 决策 5：sub-agent 的工具集只能是 parent 的子集

Sub-agent 不能获得 parent 没有的能力，不可递归 spawn（只有一层）。

### 注意事项

- Sub-agent 机制应该是**可选增强**而非架构基石——纯 ReAct 循环作为默认路径是正确的
- 随着前沿 LLM 能力提升，单 agent 的能力边界在不断扩大，sub-agent 的必要性可能随时间递减
- 对经济可行性的要求：多 agent 系统要求任务的价值足够高来覆盖增加的成本（Anthropic 原文）

### 参考资料

- [How we built our multi-agent research system - Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Single-agent or Multi-agent Systems? Why Not Both? - arXiv 2025](https://arxiv.org/abs/2505.18286)
- [Don't Build Multi-Agents - Cognition](https://cognition.ai/blog/dont-build-multi-agents)
- [Agent orchestration - OpenAI Agents SDK](https://openai.github.io/openai-agents-python/multi_agent/)
- [Claude Subagents: Complete Guide - Cursor IDE Blog](https://www.cursor-ide.com/blog/claude-subagents)
- [AI Agent Architecture: Build Systems That Work in 2026 - Redis](https://redis.io/blog/ai-agent-architecture/)
- [Multi-Agent AI Systems: When to Expand - TELUS Digital](https://www.willowtreeapps.com/craft/multi-agent-ai-systems-when-to-expand)
- [Mastering Claude Agent Patterns - SparkCo](https://sparkco.ai/blog/mastering-claude-agent-patterns-a-deep-dive-for-2025)

---

## 实现计划：Single Agent Sub-Agent 机制

### 概览

分 4 个 Phase 实施，每个 Phase 可独立测试和验证。

```
Phase 1: 基础能力 — 让 single_agent 能 spawn 内置 agent
Phase 2: 预算控制 — 防止成本失控
Phase 3: Chat Judge 复杂度感知 — 自动决定 sub-agent 预算
Phase 4: 可观测性 — 前端展示 sub-agent 执行过程
```

---

### Phase 1: 基础能力 — spawn_sub_agent tool

**目标：** 让 L2 single_agent 在 ReAct 循环中能调用内置 agent 执行子任务。

#### Step 1.1: 创建 SpawnSubAgentTool

**新建文件：** `lib/tools/spawn-sub-agent.ts`

与现有 `SpawnAgentTool`（`lib/tools/spawn-agent.ts:75-165`）的区别：
- 不依赖 workspace / blackboard / approval gate（轻量化）
- 工具集受限（只能传 parent 工具的子集）
- 禁止递归（sub-agent 不携带 spawn 能力）
- 返回结构化结果，不改变 parent 对话流

```typescript
// lib/tools/spawn-sub-agent.ts

import { BaseTool } from '@/lib/core/base-tool';
import { BaseAgent } from '@/lib/core/base-agent';
import { getAgent } from '@/lib/config/agent-registry';
import { hasAgentFactory, getAgentFactory } from '@/lib/tools/spawn-agent';
import { getTools } from '@/lib/tools/tool-registry';
import type { AgentContext } from '@/lib/core/types';

// 允许 sub-agent 使用的工具白名单（parent 工具的子集，不含 spawn 能力）
const SUB_AGENT_ALLOWED_TOOLS = ['web_search', 'read_file', 'list_files'];
const MAX_SUB_AGENT_LOOPS = 5;

interface SubAgentBudget {
  maxSubAgents: number;
  maxLoopsPerAgent: number;
  remainingSpawns: number;   // 运行时递减
  totalLoopsUsed: number;    // 运行时递增
  totalLoopsBudget: number;  // 总预算上限
}

export class SpawnSubAgentTool extends BaseTool {
  private budget: SubAgentBudget;
  private parentContext?: AgentContext;

  constructor(budget: SubAgentBudget, parentContext?: AgentContext) {
    super(
      'spawn_sub_agent',
      'Spawn a temporary sub-agent to handle a focused subtask. The sub-agent runs in isolation, completes the task, and returns results. Use this for tasks that benefit from a specialist focus (research, analysis, validation) while you maintain overall coordination.',
      {
        type: 'object',
        properties: {
          agent_name: {
            type: 'string',
            description: 'Name of a built-in agent to spawn (e.g. "analyst", "reviewer", "developer")',
          },
          task_description: {
            type: 'string',
            description: 'Clear, specific description of what the sub-agent should accomplish. Include: objective, expected output format, and any constraints.',
          },
          input_data: {
            type: 'string',
            description: 'Additional context or data the sub-agent needs to complete the task.',
          },
          max_loops: {
            type: 'number',
            description: `Max reasoning steps for this sub-agent (default: 3, max: ${MAX_SUB_AGENT_LOOPS}).`,
          },
        },
        required: ['agent_name', 'task_description'],
      }
    );
    this.budget = budget;
    this.parentContext = parentContext;
  }

  async _run(input: {
    agent_name: string;
    task_description: string;
    input_data?: string;
    max_loops?: number;
  }) {
    const { agent_name, task_description, input_data, max_loops } = input;
    const start = Date.now();

    // --- Guard: budget check ---
    if (this.budget.remainingSpawns <= 0) {
      return { agent_name, status: 'rejected', reason: 'Sub-agent spawn budget exhausted.' };
    }

    const loops = Math.min(max_loops ?? 3, MAX_SUB_AGENT_LOOPS);
    if (this.budget.totalLoopsUsed + loops > this.budget.totalLoopsBudget) {
      return { agent_name, status: 'rejected', reason: 'Total loop budget would be exceeded.' };
    }

    // --- Guard: agent exists ---
    if (!hasAgentFactory(agent_name)) {
      const meta = getAgent(agent_name);
      if (!meta) {
        return { agent_name, status: 'error', reason: `Unknown agent: "${agent_name}".` };
      }
    }

    // --- Create & run ---
    try {
      const factory = getAgentFactory(agent_name);
      const subTools = getTools(...SUB_AGENT_ALLOWED_TOOLS);
      const agent = factory({ maxLoops: loops, extraTools: subTools });

      const userMessage = input_data
        ? `${task_description}\n\n---\nContext:\n${input_data}`
        : task_description;

      const context: AgentContext = {
        logger: this.parentContext?.logger,
        traceId: this.parentContext?.traceId,
        projectId: this.parentContext?.projectId,
        recordUsage: this.parentContext?.recordUsage,
      };

      const result = await agent.run(userMessage, context);

      // --- Update budget ---
      this.budget.remainingSpawns--;
      this.budget.totalLoopsUsed += loops;

      return {
        agent_name,
        status: 'success',
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error: any) {
      return {
        agent_name,
        status: 'error',
        output: { error: error.message },
        duration_ms: Date.now() - start,
      };
    }
  }
}
```

#### Step 1.2: 注册到 tool index

**修改文件：** `lib/tools/index.ts`

在 built-in tools 注册区域追加：

```typescript
import { SpawnSubAgentTool } from './spawn-sub-agent';
// 注意：SpawnSubAgentTool 需要运行时参数（budget），不走静态注册
// 而是在 chat-engine 创建 agent 时动态实例化
```

#### Step 1.3: 修改 chat-engine handleSingleAgentWithProject

**修改文件：** `lib/services/chat-engine.ts:460-478`

```typescript
// --- 现有代码（Line 470）---
const tools = getTools('web_search', 'read_file', 'list_files');

// --- 改为 ---
import { SpawnSubAgentTool } from '@/lib/tools/spawn-sub-agent';

// 默认预算：允许 spawn，但保守限制
const subAgentBudget = {
  maxSubAgents: 3,
  maxLoopsPerAgent: 5,
  remainingSpawns: 3,
  totalLoopsUsed: 0,
  totalLoopsBudget: 15,   // sub-agent 总共最多消耗 15 个 loops
};

const tools = [
  ...getTools('web_search', 'read_file', 'list_files'),
  new SpawnSubAgentTool(subAgentBudget, agentContext),
];
```

同步将 `maxLoops` 从当前的 `5` 调整为 `10`（parent 自身需要更多步骤来协调 sub-agent）：

```typescript
const agent = new BaseAgent({
  name: 'chat-assistant',
  systemPrompt,
  tools,
  maxLoops: 10,  // 从 5 提升到 10，parent 需要步骤来拆分任务 + 聚合结果
  model: process.env.LLM_MODEL_NAME ?? 'gpt-4o',
});
```

#### Step 1.4: 更新 single_agent system prompt

**修改文件：** `lib/services/chat-engine.ts:460-468`（systemPrompt 定义处）

在现有 prompt 中追加 sub-agent 使用指引：

```
## Sub-Agent Delegation

You have access to `spawn_sub_agent` tool. Use it when:
- A subtask requires specialist focus (e.g., code review, data analysis)
- The task can be cleanly decomposed into independent pieces
- You need to gather information from multiple sources in parallel

Do NOT use sub-agents for:
- Simple, single-step operations you can handle directly
- Tasks that require your full conversation context
- Tasks where the overhead of delegation exceeds the benefit

When using sub-agents:
1. Provide a clear, self-contained task description
2. Include all necessary context in input_data (the sub-agent cannot see your conversation)
3. After receiving results, synthesize and present a unified response to the user
```

#### Phase 1 验证

```bash
# 1. tsc 编译通过
npx tsc --noEmit

# 2. 功能验证：在 chat 中发送一个中等复杂任务
#    观察 agent 是否选择使用 spawn_sub_agent
#    观察 sub-agent 执行结果是否正确返回到 parent

# 3. 预算验证：连续触发 4 次 spawn
#    第 4 次应返回 "budget exhausted"
```

---

### Phase 2: 预算控制

**目标：** 防止 sub-agent 的 token 消耗失控，实现 Anthropic 论文中的 effort scaling。

#### Step 2.1: SubAgentBudget 类型定义

**新建文件：** `lib/core/sub-agent-budget.ts`

```typescript
export type TaskComplexity = 'low' | 'medium' | 'high';

export interface SubAgentBudgetConfig {
  maxSubAgents: number;
  maxLoopsPerAgent: number;
  totalLoopsBudget: number;
}

// Effort scaling 规则（参考 Anthropic 数据）
export const BUDGET_PRESETS: Record<TaskComplexity, SubAgentBudgetConfig> = {
  low:    { maxSubAgents: 0, maxLoopsPerAgent: 0,  totalLoopsBudget: 0 },
  medium: { maxSubAgents: 3, maxLoopsPerAgent: 5,  totalLoopsBudget: 15 },
  high:   { maxSubAgents: 6, maxLoopsPerAgent: 5,  totalLoopsBudget: 30 },
};

export function createBudget(complexity: TaskComplexity) {
  const preset = BUDGET_PRESETS[complexity];
  return {
    ...preset,
    remainingSpawns: preset.maxSubAgents,
    totalLoopsUsed: 0,
  };
}
```

#### Step 2.2: BaseAgent loop 感知 sub-agent 消耗

**修改文件：** `lib/core/base-agent.ts`

在 warning messages（Line 413-426）中加入 sub-agent 消耗的提示：

```typescript
// 现有代码在 step 剩余 <= 5 时提醒 agent
// 增加：如果 sub-agent 消耗了大量 loops，提示 parent 注意预算

if (maxLoops! - step <= 5) {
  // 检查是否有 SpawnSubAgentTool，获取其 budget 状态
  const spawnTool = tools?.find(t => t.name === 'spawn_sub_agent') as any;
  const budgetInfo = spawnTool?.budget
    ? ` Sub-agent budget: ${spawnTool.budget.remainingSpawns} spawns remaining, ${spawnTool.budget.totalLoopsUsed}/${spawnTool.budget.totalLoopsBudget} loops used.`
    : '';

  messages.push({
    role: 'system',
    content: `Warning: ${maxLoops! - step} steps remaining.${budgetInfo} Wrap up your work and call ${exitToolName || 'finish'}.`,
  });
}
```

#### Step 2.3: Token 用量上报

**修改文件：** `lib/tools/spawn-sub-agent.ts`

在 sub-agent 执行完成后，通过 `recordUsage` 上报消耗：

```typescript
// 在 _run 方法的 success 分支中
if (this.parentContext?.recordUsage) {
  this.parentContext.recordUsage({
    agentName: `sub:${agent_name}`,
    projectId: this.parentContext.projectId || '',
    model: process.env.LLM_MODEL_NAME ?? 'gpt-4o',
    prompt_tokens: 0,   // 由 BaseAgent 内部上报
    completion_tokens: 0,
    total_tokens: 0,
  });
}
```

#### Phase 2 验证

```
1. 低复杂度任务 → budget.maxSubAgents=0 → spawn_sub_agent 工具不出现在工具列表中
2. 中复杂度任务 → 最多 3 个 sub-agent，每个最多 5 loops
3. parent 快用完步数时 → warning message 包含 sub-agent 预算信息
4. token 用量 → 检查 usage 表，sub-agent 消耗有独立记录
```

---

### Phase 3: Chat Judge 复杂度感知

**目标：** 扩展 Chat Judge 的评估输出，增加 sub-agent 预算建议。

#### Step 3.1: 扩展 ComplexityAssessment 类型

**修改文件：** `lib/core/types.ts`（ComplexityAssessment 定义处）

```typescript
export interface ComplexityAssessment {
  complexity_level: 'L1' | 'L2' | 'L3';
  execution_mode: ExecutionMode;
  rationale: string;
  suggested_agents: string[];
  estimated_steps: number;
  plan_outline: string[];
  requires_project: boolean;
  requires_clarification: boolean;
  // --- 新增 ---
  sub_agent_complexity?: TaskComplexity;  // 'low' | 'medium' | 'high'
}
```

#### Step 3.2: 更新 Chat Judge prompt

**修改文件：** `agents/chat-judge/prompts/system.ts`

在 L2 判定规则中增加子复杂度评估：

```
## L2 Sub-Complexity Assessment

When routing to L2 (single_agent), also assess sub-complexity:

- **low**: Single-step task, no decomposition needed.
  Examples: "Write a README", "Fix this typo", "Explain this code"
  → No sub-agents allowed.

- **medium**: Multi-step task, 2-3 independent subtasks identifiable.
  Examples: "Create a login page with validation", "Write API docs for 3 endpoints"
  → Up to 3 sub-agents, 15 total loops.

- **high**: Complex task with 4+ subtasks or research-heavy.
  Examples: "Implement full CRUD with tests", "Research and compare 3 frameworks"
  → Up to 6 sub-agents, 30 total loops.

Output field: "sub_agent_complexity": "low" | "medium" | "high"
```

#### Step 3.3: Chat Judge 输出解析

**修改文件：** `agents/chat-judge/index.ts:31-55`

在 `assessComplexity` 返回值中增加：

```typescript
return {
  // ... existing fields ...
  sub_agent_complexity: result.sub_agent_complexity ?? 'low',
};
```

#### Step 3.4: chat-engine 使用 Judge 的预算建议

**修改文件：** `lib/services/chat-engine.ts`（handleSingleAgentWithProject 内）

```typescript
// 根据 Chat Judge 的评估结果设定预算
const subComplexity = assessment.sub_agent_complexity || 'low';
const subAgentBudget = createBudget(subComplexity);

// 如果 low → 不注入 spawn_sub_agent 工具
const tools = subComplexity === 'low'
  ? getTools('web_search', 'read_file', 'list_files')
  : [
      ...getTools('web_search', 'read_file', 'list_files'),
      new SpawnSubAgentTool(subAgentBudget, agentContext),
    ];

// maxLoops 也根据复杂度调整
const maxLoops = subComplexity === 'low' ? 5 : subComplexity === 'medium' ? 10 : 15;
```

#### Phase 3 验证

```
1. "帮我写个 README" → Judge 返回 sub_agent_complexity='low' → 无 spawn 工具
2. "实现登录页面带表单验证" → Judge 返回 'medium' → 有 spawn 工具，budget=3
3. "调研 3 个框架并写对比报告" → Judge 返回 'high' → budget=6
4. 检查 assessment 对象中 sub_agent_complexity 字段是否正确持久化
```

---

### Phase 4: 可观测性

**目标：** 前端能看到 sub-agent 的执行过程和状态。

#### Step 4.1: Sub-Agent 事件通过 SSE 推送

**修改文件：** `lib/tools/spawn-sub-agent.ts`

在 sub-agent 启动和完成时通过 messageBus 发送事件：

```typescript
import { messageBus } from '@/connectors/bus/message-bus';

// _run 方法内，创建 sub-agent 后：
messageBus.emit({
  type: 'sub_agent_start',
  payload: { agent_name, task_description, parent: 'chat-assistant' },
});

// 完成后：
messageBus.emit({
  type: 'sub_agent_complete',
  payload: { agent_name, status, duration_ms, output_summary: typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200) },
});
```

#### Step 4.2: ChatView 展示 sub-agent 状态

**修改文件：** `components/chat/ChatView.tsx`（SSE handler 内）

在 SSE event handler 中增加对 `sub_agent_start` / `sub_agent_complete` 事件的处理：

```typescript
case "sub_agent_start": {
  // 展示为系统消息或内联状态指示器
  // 可以是一个带动画的 "Sub-agent analyst is working on: {task}..."
  break;
}
case "sub_agent_complete": {
  // 更新状态指示器为完成
  break;
}
```

具体 UI 设计可后续迭代，Phase 4 的核心是确保事件链路通畅。

#### Phase 4 验证

```
1. 触发 sub-agent spawn → 浏览器 SSE 收到 sub_agent_start 事件
2. sub-agent 完成 → 浏览器 SSE 收到 sub_agent_complete 事件
3. 前端展示 sub-agent 执行状态（至少 console.log 验证事件到达）
```

---

### 涉及文件汇总

| Phase | 文件 | 改动类型 |
|-------|------|----------|
| 1 | `lib/tools/spawn-sub-agent.ts` | 新建 |
| 1 | `lib/tools/index.ts` | 追加 import |
| 1 | `lib/services/chat-engine.ts:460-504` | 修改 tools 注入 + maxLoops |
| 2 | `lib/core/sub-agent-budget.ts` | 新建 |
| 2 | `lib/core/base-agent.ts:413-426` | 修改 warning 消息 |
| 2 | `lib/tools/spawn-sub-agent.ts` | 追加 usage 上报 |
| 3 | `lib/core/types.ts` | 扩展 ComplexityAssessment |
| 3 | `agents/chat-judge/prompts/system.ts` | 追加 sub-complexity 规则 |
| 3 | `agents/chat-judge/index.ts:31-55` | 解析新字段 |
| 3 | `lib/services/chat-engine.ts` | 根据 Judge 结果动态设定预算 |
| 4 | `lib/tools/spawn-sub-agent.ts` | 追加 messageBus 事件 |
| 4 | `components/chat/ChatView.tsx` | 处理 sub-agent SSE 事件 |

### 实施顺序与依赖

```
Phase 1 ← 独立，无前置依赖
Phase 2 ← 依赖 Phase 1
Phase 3 ← 依赖 Phase 1 + 2
Phase 4 ← 依赖 Phase 1（可与 Phase 2/3 并行）
```

建议 Phase 1 完成后先做端到端调试，确认 ReAct 循环内 spawn 机制稳定，再推进后续 Phase。
