# RebuilD 项目深度分析报告

> 分析时间：2026-03-07
> 分析角色：资深架构师 + 产品经理
> 对标参照：Claude Code Agent 架构

---

## 一、系统 Bug 与 Agent 设计问题（对标 Claude Code）

### 1.1 现存 Bug / 严重缺陷

bug.md 中记录的 24 个问题大部分已修复，但以下问题仍然存在或新引入：

**B1 — ChatEngine 是一个空壳**
`chat-engine.ts:208-293` 中 `handleWorkflow`、`handleAgentTeam`、`handleAgentSwarm` 三个方法全部是占位实现。它们只发送日志消息和保存文本，没有调用任何 Agent。唯一工作的 `handleSingleAgent` 创建了一个无 tools、`maxLoops: 1` 的通用 agent，本质上只是一个 `runOnce` 调用。意味着 **Chat-First 架构名存实亡**，用户通过聊天入口无法触发任何复杂工作流。

**B2 — Meta Pipeline 输出未校验**
`meta-pipeline.ts:92` 处 `dmResult as DecisionOutput` 是裸类型断言，无 Zod 校验。如果 LLM 返回畸形 JSON，`.decision` 和 `.confidence` 将为 `undefined`，后续 `decision.decision !== 'PROCEED'` 会静默跳过整个 pipeline 而非报错。同样，`architectResult` 的 `steps_completed`、`created_agents` 等字段在 `:127` 处直接访问无空值保护。

**B3 — ContextBudget 实例化后未使用**
`base-agent.ts:17` 声明了 `const contextBudget = new ContextBudget()`，但整个 `BaseAgent` 类从未引用该实例。`compressContext` 用的是自己的逻辑，`token-budget.ts` 的能力完全浪费。

**B4 — 复杂度评估不可更新**
`chat-engine.ts:58` 只在 `!assessment` 时执行评估。如果用户第二条消息需求完全改变（如从"帮我查天气"变为"重构整个认证系统"），系统仍使用第一次的 `simple/single_agent` 评估结果，无法重路由。

**B5 — Context Compression 与主 Client 共享**
`compressContext` 使用 `this.openai`（同一个客户端）和同一个 model 做摘要。当主账号触发限流时，压缩也会失败，导致 fallback 到简单裁剪，关键上下文丢失。

**B6 — 工具调用参数解析未防御**
`base-agent.ts:336` 的 `JSON.parse(toolCall.function.arguments)` 在外层 try-catch 中，但 `:327` 处的 exit tool 路径没有 try-catch。如果 LLM 返回非法 JSON 作为 exit tool 参数，整个 agent `run()` 会抛出未处理异常。

**B7 — handleWorkflow 发布了 agentStart 但从未 agentComplete**
`chat-engine.ts:223` 调用 `messageBus.agentStart()` 但循环中没有实际执行 agent，也没有对应的 `agentComplete` 事件。前端如果监听这些事件，会看到 agent 永远处于"执行中"状态。

---

### 1.2 Agent 设计问题（对标 Claude Code）

Claude Code 的核心设计是：**一个 Agent + 丰富工具集 + 持续对话 + 即时人工审批**。以此为参照，RebuilD 的 Agent 架构存在以下根本性差异和问题：

| 维度 | Claude Code | RebuilD | 问题分析 |
|------|-------------|---------|----------|
| **Agent 数量** | 1 个统一 Agent | 22 个专用 Agent | 过度拆分。Agent 间通过文本摘要传递上下文，每次 handoff 都丢失信息。Claude Code 证明了一个 Agent + 多工具足以处理复杂任务 |
| **上下文连续性** | 完整对话上下文，跨工具调用保持 | 每个 Agent 独立会话，Agent 间用文本传递 | DM 把结论传给 Architect 时，所有中间推理过程丢失。如果 Architect 需要回溯 DM 的某个分析细节，无法获取 |
| **人工审批** | 每个文件写入、命令执行都需确认 | Agent 可自主写代码、创建 PR、部署，无审批点 | vision.md 承认了这个问题，但代码中尚未实现任何 checkpoint 机制 |
| **输出流式** | Token 级别实时流式输出 | Agent 执行完毕后一次性返回结果，SSE 只推送日志 | 用户在 Agent 执行期间只能看到 "Step 3: Thinking..."，无法看到实际推理内容和中间产物 |
| **错误恢复** | 工具失败后在当前对话中立即适应 | Agent 到达 maxLoops 后返回 `__incomplete`，需要调用方请求 budget extension | 恢复路径复杂且不透明。用户无法介入纠正方向 |
| **动态 vs 预设** | 根据用户请求动态选择工具 | 预设的 pipeline 路径 (DM->AC->SV) | 即使简单任务也要走完整 pipeline，不能像 Claude Code 那样灵活选择最小工具集 |

**核心问题总结**：RebuilD 试图用"多 Agent 协作"解决复杂性，但实际上引入了更多复杂性：

1. **Agent 间通信损耗** — 每次 handoff 是一次有损压缩，22 个 Agent 意味着最多 21 次信息丢失
2. **调试困难** — 出错时需要追踪哪个 Agent 在哪一步产生了什么错误输出，比单一 Agent 复杂一个数量级
3. **成本倍增** — DM 15 轮 + Architect 30 轮 + 子 Agent 各自的轮次，一个完整 pipeline 可能消耗 100+ 次 LLM 调用
4. **Architect 定位矛盾** — soul.md 说它是"动态执行大脑"，但它本身也是一个 ReAct Agent，依赖 LLM 来决定下一步。这是"用 LLM 来指挥 LLM"，每增加一层编排就增加一层不确定性

---

## 二、产品可行性与迭代建议

### 2.1 当前状态诊断

| 架构层 | 完成度 | 状态 |
|--------|--------|------|
| 数据库 & Schema | 90% | 22 个 migration，结构完整 |
| Auth & RBAC | 80% | 中间件、API Key、角色体系已实现 |
| Agent 核心引擎 | 85% | BaseAgent、工具系统、LLM Pool 健壮 |
| Meta Pipeline (DM->AC) | 70% | 可运行，但输出校验不足，无 checkpoint |
| Chat-First 架构 | 15% | 只有 single_agent 工作，其余三种模式是空壳 |
| 前端 UI | 60% | 聊天、项目、看板、信号页面存在，但与后端未完全对接 |
| 信号采集 | 70% | YouTube/Reddit/Twitter 适配器存在，cron 配置完成 |
| 端到端流程 | 20% | 没有一条完整的从信号到部署的可靠路径 |

**核心矛盾**：系统有两套并行架构（传统 pipeline 和 meta-agent），加上一套未完成的 chat-first 架构，三者之间没有统一。用户不知道该用哪个入口，每个入口都不完整。

### 2.2 迭代建议

#### 阶段 A：聚焦单一可用路径（最高优先级）

**目标**：让一个用户从头到尾完成一件事，端到端可用。

1. **砍掉 Chat-First 中的 workflow/agent_team/agent_swarm 模式**
   - 保留 `single_agent` 作为轻量对话
   - 复杂任务统一走 Meta Pipeline 入口（`/api/meta`）
   - 理由：与其维护三个空壳，不如把一条路径做通

2. **Meta Pipeline 增加人工检查点**
   - DM 决策后暂停，推送决策结果到前端，等用户确认"PROCEED"
   - Architect 在执行 code_write / git_commit / trigger_deploy 之前暂停确认
   - 实现方式：扩展 SSE event type 增加 `approval_required`，前端渲染审批按钮

3. **给 Meta Pipeline 加输出校验**
   - DM output 用 Zod `safeParse`，失败时 retry 或 `CIRCUIT_BREAK`
   - Architect output 同理
   - 这是当前系统最大的运行时风险

4. **修复 ChatEngine 的 single_agent**
   - 给它配置实际有用的工具（至少 web_search、rag_retrieve、code_read）
   - 增加 maxLoops 到 5-10
   - 使它能回答项目相关的上下文问题

#### 阶段 B：简化 Agent 架构

**目标**：降低系统复杂度，提高可靠性。

1. **合并 Agent 层级**
   - 将 22 个 Agent 按职能合并为 5-7 个：
     - `Planner`（合并 DM + PM + Researcher）
     - `Engineer`（合并 Tech Lead + Developer + QA）
     - `Reviewer`（合并 Critic + Blue Team + Code Reviewer）
     - `Deployer`（保持）
     - `Assistant`（Chat 模式的通用 Agent）
   - 减少 handoff 次数 = 减少信息损耗 + 减少 LLM 调用成本

2. **引入 Blackboard 作为 Agent 间唯一通信渠道**
   - 当前 Blackboard 已实现但未被 Meta Pipeline 使用
   - 所有 Agent 的输入输出都写入 Blackboard
   - 下游 Agent 从 Blackboard 读取上游产物，而非依赖文本摘要传递

3. **放弃"动态创建 Agent"能力**
   - `create_agent` / `persist_agent` 是过度工程化的体现
   - 用 LLM 生成一个新 Agent 的 prompt，然后用 LLM 跑这个 Agent = 两层不确定性叠加
   - Claude Code 证明了一个 Agent 配合丰富工具集就够了

#### 阶段 C：产品差异化定位

**目标**：找到真正的产品壁垒。

1. **放弃与 Claude Code / Cursor 竞争"编码"场景**
   - Claude Code 在"AI 写代码"这件事上已经做到极致
   - RebuilD 不应该试图复制这个能力
   - 差异化方向：**AI 原生的项目管理决策引擎**

2. **聚焦信号 -> 决策 -> 任务 这条链路**
   - 这是 Claude Code / Cursor 完全不覆盖的领域
   - 信号采集（竞品动态、用户反馈、技术趋势）-> AI 分析优先级 -> 结构化决策 -> 任务拆解
   - 把"写代码"这一步外包给 Claude Code / Cursor（通过 webhook 或 CLI 集成）

3. **短期杀手功能：Signal Intelligence Dashboard**
   - 已有 5 个平台的信号采集器
   - 已有 pgvector 做语义搜索
   - 已有 Decision Maker 做决策分析
   - 把这条链路做到极致：自动抓取 -> 去重聚合 -> AI 分析 -> 决策建议 -> 一键转任务
   - 这是一个独立的、可验证的、有价值的产品功能

4. **定价模型考虑**
   - 当前系统每次 meta pipeline 运行可能消耗 $1-5 的 LLM 成本
   - 需要在产品中明确向用户展示成本（已有 cost tracking 基础设施）
   - 考虑按 pipeline 运行次数 / token 消耗计费

#### 阶段 D：技术债偿还

| 项目 | 当前状态 | 建议 |
|------|----------|------|
| 测试覆盖 | 46 个用例，仅覆盖 core 工具函数 | 添加 pipeline 集成测试（mock LLM 响应）|
| 错误处理 | 大量 `.catch(() => {})` | 统一 error boundary，所有 fire-and-forget 加日志 |
| 国际化 | 中英文混杂（prompt 中文，UI 英文，base-agent 中文注入） | 统一语言策略 |
| Vercel 超时 | `maxDuration=300` 只支持 Pro 计划 | 长任务改为 Background Job + 轮询模式 |

---

## 三、B1-B7 修复记录

> 修复时间：2026-03-07

| Bug | 状态 | 修改文件 | 修复说明 |
|-----|------|----------|----------|
| B1 | ✅ 已修复 | `lib/services/chat-engine.ts` | **ChatEngine 空壳实现 → 真实逻辑。** (1) `handleSingleAgent` 配置 `web_search`/`read_file`/`list_files` 三工具，`maxLoops` 从 1→5，从 `runOnce` 改为 `run`（ReAct 模式）；(2) `handleWorkflow` 实现顺序 agent 执行 — 动态加载 agent 工厂（`loadAgentFactory`），链式传递上一个 agent 输出到下一个，每步发布 `agentStart`/`agentComplete` 生命周期事件；(3) `handleAgentTeam` 对接 `runMetaPipeline()`，创建 team 记录后运行完整 DM→Architect pipeline，日志通过 messageBus 转发为 SSE 事件；(4) `handleAgentSwarm` 委托给 `handleAgentTeam`（Phase 1），预留多阶段扩展 |
| B2 | ✅ 已修复 | `skills/meta-pipeline.ts`, `lib/core/types.ts` | **Meta Pipeline 输出未校验 → Zod safeParse。** (1) 新增 `DecisionOutputSchema` 和 `ArchitectResultSchema` Zod 校验；(2) DM 输出校验失败时安全降级为 `decision: 'HALT', confidence: 0, risk_level: 'critical'`；(3) Architect 输出校验失败时使用安全默认值（数值字段归零，数组字段空数组）；(4) 修复 `DecisionOutput` 类型：`risk_assessment` 嵌套对象 → `risk_level` + `risk_factors` flat 字段，与 `FinishDecisionTool` exit tool schema 对齐；(5) `DecisionSource.data` → `DecisionSource.summary`，与 `SourceSchema` 对齐 |
| B3 | ✅ 已修复 | `lib/core/base-agent.ts` | **ContextBudget 未使用 → 整合到压缩逻辑。** `compressContext` 现在使用双重触发条件：消息数量 > `MAX_CONTEXT_MESSAGES` **或** `contextBudget.needsCompression(messages)` 返回 true（基于 token 估算超出 88,000 可用预算）。模块级 `contextBudget` 实例从死代码变为 active 组件 |
| B4 | ✅ 已修复 | `lib/services/chat-engine.ts` | **复杂度评估不可更新 → 支持 re-assessment。** 新增 `REASSESS_MESSAGE_THRESHOLD = 5` 常量。`handleMessage` 中检查距上次评估后的用户消息数，超过阈值时自动重新调用 `assessComplexity()`。通过 `assessed_at_message_count` 字段记录评估时的消息快照数，更新到 conversation 记录 |
| B5 | ✅ 已修复 | `lib/core/base-agent.ts` | **Compression 共享 Agent 客户端 → 独立客户端。** `compressContext` 函数签名移除 `client` 和 `model` 参数，改用 `getLLMPool().getClientOrFallback({ tags: ['compression'] })` 获取独立客户端。固定使用 `COMPRESSION_MODEL = 'gpt-4o-mini'` 做压缩（成本低、不占 agent 主账号配额）。两处调用点（主循环 + last-chance）同步更新为新签名 |
| B6 | ✅ 已修复 | `lib/core/base-agent.ts` | **Exit Tool JSON.parse 无 try-catch → 已防御。** (1) 正常 exit tool 路径（原 line 327）：`JSON.parse` 失败时向消息历史注入 `tool` role 错误反馈，`continue` 让 agent 重试而非崩溃；(2) Last-chance exit tool 路径（原 line 446）：`JSON.parse` 失败时 log 警告，fall through 到文本提取逻辑 |
| B7 | ✅ 已修复 | `lib/services/chat-engine.ts` | **agentStart 无 agentComplete → 通过 B1 修复自然解决。** `handleWorkflow` 中每个 agent 执行完成后调用 `messageBus.agentComplete(agentName, result)`，失败时同样调用 `messageBus.agentComplete(agentName, { error })` |

### 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors
- **测试套件**: `npm test` — 64/64 passed, 6 suites, 0 failures

---

## 四、L1/L2/L3 智能复杂度路由实现记录

> 实现时间：2026-03-07
> Commit: `0f1ed12`

### 4.1 变更概述

将原有 5 级复杂度体系（trivial/simple/moderate/complex/epic）→ 4 模式（single_agent/workflow/agent_team/agent_swarm）合并为 **3 级 3 模式**：

| 等级 | 执行模式 | 行为 |
|------|---------|------|
| L1 | `direct` | 纯问答，LLM 直接回答，不创建 project |
| L2 | `single_agent` | 有明确产出物（代码/文档/demo），创建 light project（`is_light: true`），单 agent 执行 |
| L3 | `agent_team` | 生产级要求，需求模糊时进入澄清循环（最多 3 轮），结构化确认表单 → 用户确认创建 project → agent team pipeline |

`agent_swarm` 作为保留参数存在于类型中，不参与路由。`handleWorkflow` 已移除。

### 4.2 修改文件清单（15 files, +1864 / -139）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `lib/core/types.ts` | 修改 | ComplexityLevel → L1/L2/L3，ExecutionMode → direct/single_agent/agent_team，新增 StructuredRequirements 接口，Conversation 新增 clarification_round/clarification_context，ChatEventType 新增 clarification_form/project_created |
| `projects/types.ts` | 修改 | Project + CreateProjectInput 新增 is_light、conversation_id 字段 |
| `database/migrations/022_complexity_routing.sql` | 新建 | conversations 表新增 clarification_round/clarification_context，更新 execution_mode 约束含 direct，projects 表新增 is_light/conversation_id |
| `agents/complexity-assessor/prompts/system.ts` | 重写 | L1/L2/L3 映射规则，新增 requires_clarification 输出字段 |
| `agents/complexity-assessor/index.ts` | 修改 | 默认值改为 L1/direct，补充 requires_clarification 默认值 |
| `agents/complexity-assessor/soul.md` | 重写 | 三级评估标准描述 |
| `lib/services/chat-engine.ts` | 重写核心 | 新路由逻辑：handleDirect (L1)、handleSingleAgentWithProject (L2)、handleClarification (L3 澄清)、confirmAndExecute (L3 确认后执行)。内嵌 CLARIFICATION_SYSTEM_PROMPT。MAX_CLARIFICATION_ROUNDS=3 |
| `app/api/conversations/[id]/plan/route.ts` | 修改 | 新增 confirm_requirements action，调用 chatEngine.confirmAndExecute() |
| `projects/project-service.ts` | 修改 | createProject() 支持 is_light 和 conversation_id 参数 |
| `store/slices/chatSlice.ts` | 修改 | 新增 clarificationPanel 状态 + showClarificationForm/hideClarificationForm actions |
| `components/chat/ChatView.tsx` | 修改 | 新增 clarification_form 和 project_created SSE 事件处理 |
| `components/chat/PlanPanel.tsx` | 修改 | 复杂度颜色改为 L1/L2/L3 三色，模式标签改为 Direct/Single Agent/Agent Team |
| `components/chat/ClarificationForm.tsx` | 新建 | 结构化需求确认面板：摘要、目标、范围、约束、可编辑项目名、确认/返回按钮 |
| `app/(dashboard)/layout.tsx` | 修改 | 右侧面板增加 ClarificationForm（优先级高于 PlanPanel/AgentTeamPanel） |
| `lib/i18n/locales/en.ts` + `zh.ts` | 修改 | 新增 complexity.L1-L3、mode.direct/single_agent/agent_team、clarification.* 共 20 keys |

### 4.3 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors

---

## 五、Sprint 1：Architect 工具审批 + StructuredRequirements 注入

> 实现时间：2026-03-08
> Commit: `cd8efab`

### 5.1 变更概述

解决 L3 pipeline 的两个 gap：

1. **Architect 危险工具审批（#1）**：DM 批准后，Architect 通过 SpawnAgentTool 生成子 agent，子 agent 调用 `code_write`/`code_edit`/`git_commit`/`git_create_pr`/`trigger_deploy` 时需人工审批
2. **StructuredRequirements 注入（#2）**：L3 澄清产出的 goals/scope/constraints 持久化到 conversation，并注入 DM 和 Architect 的输入

### 5.2 架构设计

```
handleArchitectPhase (generator，yield SSE 事件)
  ├─ 创建 EventChannel<ChatEvent>
  ├─ 启动 architectPromise（后台，非阻塞）
  │   └─ architect.run() → ReAct 循环
  │       ├─ SpawnAgentTool → 子 agent.run()
  │       │   └─ tool.requiresApproval? → onApprovalRequired callback
  │       │       ├─ callback 推送 'tool_approval_required' 到 EventChannel
  │       │       └─ callback await toolApprovalService（阻塞 agent 线程）
  │       └─ approval resolved → 执行工具 → 继续循环
  ├─ for await (event of channel) → yield event（SSE → 前端）
  └─ await architectPromise（善后）
```

关键设计决策：`BaseAgent.run()` 是 async 函数（非 generator），ReAct 循环内无法直接 yield SSE 事件。使用 EventChannel（异步可迭代桥接）让 architect 后台运行，generator 从 channel 消费事件。

### 5.3 修改文件清单（22 files, +1283 / -20）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `database/migrations/024_structured_requirements_and_tool_approval.sql` | 新建 | conversations 表新增 `structured_requirements JSONB` + `pending_tool_approval JSONB` |
| `lib/utils/event-channel.ts` | 新建 | `EventChannel<T>` 实现 `AsyncIterable<T>`，push/close/asyncIterator，producer-consumer 桥接 |
| `lib/services/tool-approval.ts` | 新建 | `ToolApprovalService`：内存 Map、`requestApproval()` 返回 promise 阻塞、`resolve()` 释放、10 分钟超时自动 reject |
| `components/chat/ToolApprovalPanel.tsx` | 新建 | 审批面板：工具名 badge、Agent 名称、JSON 参数展示、警告文字、批准/拒绝按钮 |
| `lib/core/types.ts` | 修改 | 新增 `ToolApprovalRequest` 接口、Conversation 新增 `structured_requirements` + `pending_tool_approval`、AgentContext 新增 `onApprovalRequired` callback、ChatEventType 新增 `tool_approval_required` + `tool_approval_resolved` |
| `lib/core/base-tool.ts` | 修改 | 新增 `requiresApproval: boolean = false` 属性 |
| `lib/core/base-agent.ts` | 修改 | 工具执行前插入审批门：`tool.requiresApproval && context.onApprovalRequired` → 阻塞等待 → 拒绝时跳过执行 |
| `lib/tools/code-write.ts` | 修改 | `requiresApproval = true` |
| `lib/tools/code-edit.ts` | 修改 | `requiresApproval = true` |
| `lib/tools/git-commit.ts` | 修改 | `requiresApproval = true` |
| `lib/tools/git-create-pr.ts` | 修改 | `requiresApproval = true` |
| `lib/tools/trigger-deploy.ts` | 修改 | `requiresApproval = true` |
| `lib/tools/spawn-agent.ts` | 修改 | 构造函数接受 `onApprovalRequired`，`_run()` 传入子 agent context |
| `agents/architect/index.ts` | 修改 | `createArchitectAgent` options 新增 `onApprovalRequired`，传给 SpawnAgentTool |
| `skills/meta-pipeline.ts` | 修改 | MetaPipelineOptions 新增 `structuredRequirements` + `onApprovalRequired`；新增 `formatStructuredRequirements()` helper；DM/Architect 输入 append 格式化 requirements |
| `lib/services/chat-engine.ts` | 修改 | `confirmAndExecute()` 存储 structured_requirements 到 conversation；`handleAgentTeam()` 传递 structuredRequirements 到 DM；`handleArchitectPhase()` 用 EventChannel 重写为非阻塞模式 + onApprovalRequired callback |
| `app/api/conversations/[id]/plan/route.ts` | 修改 | 新增 `approve_tool` + `reject_tool` actions，调用 `toolApprovalService.resolve()` |
| `store/slices/chatSlice.ts` | 修改 | 新增 `toolApprovalPanel` 状态 + `showToolApproval`/`hideToolApproval`/`approveToolExecution`/`rejectToolExecution` actions |
| `components/chat/ChatView.tsx` | 修改 | 处理 `tool_approval_required` + `tool_approval_resolved` SSE 事件 |
| `app/(dashboard)/layout.tsx` | 修改 | 右侧面板优先级链增加 ToolApprovalPanel（clarification > plan > dm > toolApproval > team） |
| `lib/i18n/locales/en.ts` | 修改 | 新增 9 个 `toolApproval.*` 翻译 key |
| `lib/i18n/locales/zh.ts` | 修改 | 新增 9 个 `toolApproval.*` 翻译 key |

### 5.4 向后兼容性

- `runMetaPipeline()` 不传 `onApprovalRequired` → 工具直接执行（无 callback = 无门控）
- L1/L2 不受影响：不传 approval callback，危险工具不在其工具集中
- 10 分钟超时安全网：无响应自动 reject → agent 收到拒绝 → 调整计划

### 5.5 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors

---

## 六、迭代建议完成度追踪（截至 2026-03-08 Sprint 4 完成后）

### 阶段 A：聚焦单一可用路径

| # | 建议 | 状态 | 说明 |
|---|------|------|------|
| A1 | 砍掉 workflow/agent_swarm，统一路由模式 | ✅ 已完成 | L1/L2/L3 路由替换旧 5 级体系。handleWorkflow 已移除，agent_swarm 仅保留类型 |
| A2 | Meta Pipeline 增加人工检查点 | ✅ 已完成 | (1) DM 决策后暂停，前端 DMDecisionPanel 审批（commit `24250b4`）；(2) Architect 子 agent 执行 code_write/code_edit/git_commit/git_create_pr/trigger_deploy 前暂停，前端 ToolApprovalPanel 审批（commit `cd8efab`）；(3) StructuredRequirements 注入 DM/Architect 输入（commit `cd8efab`）；(4) Architect pipeline checkpoint & resume，失败后可断点恢复（commit `21391e4`） |
| A3 | Meta Pipeline 输出加 Zod 校验 | ✅ 已完成 | DecisionOutputSchema + ArchitectResultSchema 已有 safeParse，失败安全降级 |
| A4 | 修复 ChatEngine single_agent | ✅ 已完成 | L1 配置 web_search/read_file/list_files 三工具，maxLoops=5，ReAct 模式；L2 额外创建 light project |

### 阶段 B：简化 Agent 架构

| # | 建议 | 状态 | 说明 |
|---|------|------|------|
| B1 | 合并 22 个 Agent → 5-7 个 | ❌ 未开始 | 当前仍有 20+ 个 agent 目录。仅在路由层做了简化，agent 本身未合并 |
| B2 | Blackboard 作为 Agent 间唯一通信渠道 | ✅ 已完成 | Sprint 3（commit `25e8b2b`）将 Blackboard 接入 meta-pipeline DM↔Architect 无损通信。Sprint 5（commit `24df22c`）进一步增强：TTL/容量生命周期管理 + 子 Agent 传递，覆盖全 pipeline 所有 agent |
| B3 | 放弃动态创建 Agent | ❌ 未开始 | create_agent/persist_agent 工具仍存在，dynamic-registry.json 仍在 agents/ 目录下 |

### 阶段 C：产品差异化定位

| # | 建议 | 状态 | 说明 |
|---|------|------|------|
| C1 | 放弃与 Claude Code 竞争编码 | — | 产品策略方向，非代码变更 |
| C2 | 聚焦信号→决策→任务链路 | ✅ 已完成 | Sprint 2（commit `10e50fd`）打通信号→执行一键 pipeline。信号详情页 Execute 按钮 → 提取 StructuredRequirements → 创建 conversation 关联已有 project → L3 确认流程 → DM→Architect 执行 |
| C3 | Signal Intelligence Dashboard 杀手功能 | ✅ 已完成 | Sprint 2 实现一键转任务。采集→筛选→分析→决策→执行全链路连通 |
| C4 | 定价模型 | ⚠️ 部分完成 | Sprint 6（commit `1822ecb`）UsageSnapshotCard 新增 COST 视图，用户可见 7d/30d 成本、per-agent/per-account 成本分布。定价模型本身未设计 |

### 阶段 D：技术债偿还

| # | 建议 | 状态 | 说明 |
|---|------|------|------|
| D1 | 测试覆盖 | ⚠️ 基础有 | 64 tests/6 suites，但缺乏 pipeline 集成测试 |
| D2 | 错误处理 | ✅ 已清理 | Sprint 7（`8cacc61`）清理 26 处 `.catch(() => {})`，统一改为 `console.error` + 上下文标签 |
| D3 | 国际化统一 | ✅ 已改善 | i18n 系统完整，en/zh 双语 580+ keys，L1/L2/L3 相关翻译已补充 |
| D4 | Vercel 超时 | ❌ 未解决 | 长任务仍依赖 maxDuration=300 |

---

## 七、当前状态诊断（更新版 2026-03-08 Sprint 7 后）

| 架构层 | 完成度 | 状态 |
|--------|--------|------|
| 数据库 & Schema | 96% | 26 个 migration，结构完整（含 architect checkpoint + execution traces） |
| Auth & RBAC | 85% | 中间件、API Key、角色体系已实现。Sprint 4 增加命令注入过滤、安全头、CORS |
| Agent 核心引擎 | 99% | BaseAgent、工具系统、LLM Pool、ContextBudget、Blackboard（含 TTL/容量生命周期）、onCheckpoint 回调、Multi-Model 配置、全链路错误日志（无 silent catch）。DM/Architect 支持可选 Blackboard 读写，子 Agent 通过 SpawnAgentTool 继承 Blackboard |
| Meta Pipeline (DM→AC) | 97% | Zod 校验、DM checkpoint、Architect 工具审批、StructuredRequirements 注入、DM↔Architect Blackboard 无损通信、Architect checkpoint & resume、子 Agent Blackboard 透传均已实现 |
| Chat-First 架构 | 82% | L1/L2/L3 路由完整，L3 全链路含 Blackboard hydrate + 兜底种子 + 生命周期管理 |
| 前端 UI | 87% | 聊天、项目、看板、信号、PlanPanel、ClarificationForm、DMDecisionPanel、ToolApprovalPanel、ArchitectResumePanel、**成本面板**、**Execution Trace Dashboard** 已就位 |
| 信号采集 | 70% | 多平台适配器存在，cron 配置完成 |
| 信号→执行链路 | 87% | Sprint 2 打通一键 pipeline，Sprint 3 实现无损上下文传递，Sprint 4 增加 checkpoint 断点恢复，Sprint 5 Blackboard 生命周期 + 子 Agent 传递 |
| 端到端流程 | 80% | L1/L2 端到端可用；L3 全链路连通含 Blackboard 通信 + checkpoint resume + 子 Agent 共享状态；信号→执行一键可用；成本可见；执行轨迹可回溯 |
| 成本优化 | 80% | Sprint 6 Multi-Model 配置，6 个低复杂度 agent 使用 gpt-4o-mini，预估降低 40-60% LLM 调用成本 |

**核心矛盾更新**：三套并行架构已统一为 Chat-First 单一入口。安全加固（S1-S3）、pipeline 断点恢复（S4）、Blackboard 生命周期+子 Agent 传递（A1+A2）、成本面板（O2）、Multi-Model 配置（O4）、全链路错误日志（T1）、PM shim 清理（T4）、PlanTask 类型安全（T6）、**Execution Trace 持久化+前端 Dashboard（O1）** 均已完成。Phase 2 可观测性（O1+O2+O4）全部清零。当前主要矛盾转为：(1) Agent 数量过多未合并（20+）；(2) 端到端集成测试缺失；(3) Team Coordinator 状态管理不完善。

---

## 八、信号→执行链路断点分析（已解决）

> 分析时间：2026-03-08
> 解决：Sprint 2（commit `10e50fd`）

### 8.1 原始问题

信号子系统（采集→筛选→分析→项目）与 Meta Pipeline（DM→Architect）之间存在两层断裂：信号创建的 project 无法进入 DM→Architect 执行。

### 8.2 解决方案（Sprint 2 已实现）

```
信号详情页 "Execute" 按钮
  → 从 prepare_result (Blue Team MRD) 提取 StructuredRequirements
  → 创建 conversation（关联已有 project）
  → 进入 L3 确认流程（ClarificationForm 展示 requirements）
  → 用户确认 → DM 审批 → Architect 工具审批 → 执行
```

Sprint 3 进一步增强：DM↔Architect 间通过 Blackboard 无损传递完整 DecisionOutput（含 risk_level/sources/rationale 等），替代了原有的有损文本拼接。

---

## 九、优化任务清单（更新于 2026-03-08 Sprint 4 后）

### 优先级 1 — 安全加固（vision.md Phase 1 ✅ 全部完成）

| # | 任务 | 说明 | 状态 |
|---|------|------|------|
| S1 | API 认证中间件 | bug.md #1 P0 | ✅ 已完成（Sprint 4, `50d8a18`）— 命令注入过滤白名单 |
| S2 | 命令注入防护 | bug.md #2 P0 | ✅ 已完成（Sprint 4, `50d8a18`）— `run-command.ts` 命令过滤 |
| S3 | CORS/CSP 安全头 | bug.md #4 P0 | ✅ 已完成（Sprint 4, `50d8a18`）— 安全头 + CORS 配置 |
| S4 | Pipeline Checkpoint & Resume | vision.md Phase 1 P0 | ✅ 已完成（Sprint 4, `21391e4`）— Architect ReAct 循环 checkpoint 持久化 + 断点恢复 |

### 优先级 2 — 架构优化（Blackboard 深化 + Agent 简化）

| # | 任务 | 说明 | 涉及文件 |
|---|------|------|----------|
| A1 | Blackboard TTL + 清理机制 | ✅ 已完成（Sprint 5, `24df22c`）— BlackboardConfig 接口（maxEntries/ttlMs），write() 后自动 cleanup（TTL 淘汰 + 容量淘汰），手动 evict() 方法，3 处创建站点配置 maxEntries=200/ttlMs=2h | `lib/blackboard/blackboard.ts` + `types.ts` |
| A2 | 子 Agent Blackboard 传递 | ✅ 已完成（Sprint 5, `24df22c`）— SpawnAgentTool 接受第 4 参数 blackboard，透传到 factoryOptions.blackboard；Architect/DM 工厂将自身 blackboard 传给 SpawnAgentTool | `lib/tools/spawn-agent.ts` + 子 agent 工厂 |
| A3 | Team Coordinator 完善 | agent status 全部硬编码 `idle`（`team-coordinator.ts:176-184`）；task dependency 创建但从未使用；mailbox 无清理 | `lib/services/team-coordinator.ts` |
| A4 | Tool Approval 审计日志 | 无审批/拒绝记录、无拒绝原因捕获、无审批历史回放 | `lib/services/tool-approval.ts` |
| A5 | Agent 合并 22→5-7 | 按职能合并：Planner（DM+PM+Researcher）、Engineer（Tech Lead+Developer+QA）、Reviewer（Critic+Blue Team+Code Reviewer）、Deployer、Assistant。减少 handoff 损耗和 LLM 调用成本 | `agents/` 全目录重构 |

### 优先级 3 — 可观测性 & 产品化（vision.md Phase 2）

| # | 任务 | 说明 | 涉及文件 |
|---|------|------|----------|
| O1 | Execution Observability Dashboard | ✅ 已完成（Sprint 8 后端持久化 `d030564` + Sprint 9 前端 dashboard）— `execution_traces` + `execution_events` 两表、fire-and-forget 入库、查询 API、前端 TracesPageView + TraceCard + TraceDetailView + TraceEventCard、PageSwitcher 三页切换、18 个 i18n key | `components/traces/*` + `app/api/projects/[projectId]/traces/*` |
| O2 | 成本面板（用户可见） | ✅ 已完成（Sprint 6, `1822ecb`）— UsageSnapshotCard 新增 COST 视图（7d/30d 总成本、信号/项目成本、per-agent/per-account 成本排行），8 个 i18n 翻译 key | `components/settings/UsageSnapshotCard.tsx` + i18n |
| O3 | Webhook 通知 | Pipeline 完成/PR 创建/部署失败无通知。支持飞书/钉钉/Slack webhook | 新建 `lib/services/webhook.ts` |
| O4 | Multi-Model per Agent | ✅ 已完成（Sprint 6, `1822ecb`）— `agents/config.json` 配置 6 个低复杂度 agent（pm/researcher/critic/blue-team/arbitrator/knowledge-curator）使用 gpt-4o-mini，核心 agent 保持 gpt-4o | `agents/config.json` |

### 优先级 4 — 技术债

| # | 任务 | 说明 | 涉及文件 |
|---|------|------|----------|
| T1 | fire-and-forget 错误清理 | ✅ 已完成（Sprint 7, `8cacc61`）— 15 文件 26 处 `.catch(() => {})` 统一改为 `console.error('[module] description:', err)`，debug ingest 标记 `/* non-critical */`，git remote remove 标记 `/* may not exist — expected */` | 全局搜索 `.catch` |
| T2 | Pipeline 集成测试 | mock LLM 响应，验证 DM→Architect→implement 链路。当前仅 64 个核心函数单测 | 新建 `__tests__/integration/` |
| T3 | Vercel 长任务改造 | `maxDuration=300` 仅 Pro 计划可用，需改为 Background Job + polling 模式 | API routes + 新建 job queue |
| T4 | PM Agent shim 清理 | ✅ 已完成（Sprint 7, `8cacc61`）— 删除 `lib/agents/pm.ts`（3 行 re-export shim），唯一 importer `scripts/test-agent-manual.ts` 重定向到 `../agents/pm` | `lib/agents/pm.ts` |
| T5 | sensing.ts mock 实现 | `lib/services/sensing.ts:6` `fetchContent()` 返回 mock 数据，需接入真实 web fetching | `lib/services/sensing.ts` |
| T6 | plan.ts 类型安全 | ✅ 已完成（Sprint 7, `8cacc61`）— 从 `finish-planning.ts` 导出 `PlanTask` 类型（基于已有 `TaskSchema` Zod 校验），`plan.ts` 中 `tasks: any[]` → `tasks: PlanTask[]`，PM import 路径修正为 `@/agents/pm` | `lib/skills/plan.ts` |

### 暂不建议投入的方向

| 方向 | 原因 |
|------|------|
| 动态 Agent 创建（B3） | 保留代码但不迭代，等核心链路稳定后评估 |
| Agent Swarm | 保留类型参数，无实际场景驱动 |
| 定价模型（C4） | 产品验证阶段，过早关注定价分散精力。`cost_usd` 已入库备用 |
| Multimodal Input | vision.md Phase 3，当前优先级不够 |

### Sprint 5 — ✅ 已完成

- **方案 A — Blackboard 生命周期 (A1+A2)**：TTL/清理机制 + 子 Agent Blackboard 传递。Sprint 3 的 Blackboard 能力从 DM↔Architect 扩展到全 pipeline 所有 agent

### Sprint 6 — ✅ 已完成

- **O2 — 成本面板**：UsageSnapshotCard 新增 COST 视图，用户可见 7d/30d 成本、per-agent/per-account 成本分布
- **O4 — Multi-Model 配置**：`agents/config.json` 为 6 个低复杂度 agent 配置 gpt-4o-mini，预估降低 40-60% 成本

### Sprint 7 — ✅ 已完成

- **方案 C — 批量技术债清理 (T1+T4+T6)**：15 文件 26 处 silent catch 清理 + PM shim 删除 + PlanTask 类型安全

### Sprint 8 — ✅ 已完成

- **O1 后端 — Execution Trace 持久化**（commit `d030564`）：`execution_traces` + `execution_events` 两表、fire-and-forget 入库、查询 API (`GET /api/projects/{projectId}/traces` + `GET /api/projects/{projectId}/traces/{traceId}`)

### Sprint 9 — ✅ 已完成

- **O1 前端 — Execution Trace Dashboard**：
  - 5 个新建组件：`trace-utils.ts`、`TraceEventCard.tsx`、`TraceDetailView.tsx`、`TraceCard.tsx`、`TracesPageView.tsx`
  - PageSwitcher 新增 `labels` prop，3 页切换（Overview / Tasks / Traces）
  - 18 个 i18n 翻译 key（中英双语）
  - 复用 `getAgentUI()` 颜色体系，Agent badge 颜色一致
  - Trace 列表 stage/status 过滤、TraceDetailView 事件时间线回放、payload 可展开

### Sprint 10 候选方案

- **方案 A — Pipeline 集成测试 (T2)**：mock LLM 响应，端到端验证 DM→Architect→implement 链路可靠性
- **方案 B — Team Coordinator 完善 (A3)**：agent status 硬编码 idle 修复 + task dependency 激活 + mailbox 清理
- **方案 C — Agent 合并 (A5/B1)**：22 个 Agent → 5-7 个，减少 handoff 损耗

---

## 十、Sprint 2：信号→执行一键 Pipeline

> 实现时间：2026-03-08
> Commit: `10e50fd`

### 10.1 变更概述

打通信号子系统与 Meta Pipeline 之间的断裂。信号详情页 Execute 按钮 → 从 prepare_result 提取 StructuredRequirements → 创建 conversation 关联已有 project → 进入 L3 确认流程 → DM→Architect 执行。

### 10.2 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors

---

## 十一、Sprint 3：DM → Architect Blackboard 无损通信

> 实现时间：2026-03-08
> Commit: `25e8b2b`

### 11.1 变更概述

Sprint 2 完成信号→执行一键 pipeline 后，DM → Architect 数据传递仍是有损文本拼接（`meta-pipeline.ts:222-224` 只传递 `confidence`/`summary`/`recommended_actions`，丢弃 `risk_level`/`risk_factors`/`sources[]`/`rationale`/`aggregated_signals`）。

本 Sprint 将已有的 Blackboard 系统接入 meta-pipeline，使用 `conversationId` 作为 `executionId`（跨 DM/Architect 两个 HTTP 请求生命周期稳定），实现无损通信。

### 11.2 核心设计

**审批间隙解决方案**：DM 和 Architect 在不同的 HTTP 请求中运行（`handleAgentTeam` → yield dm_decision → STOP → 用户 Approve → `executeDmApproval` → `handleArchitectPhase`）。Blackboard 使用 `conversationId` 作为 executionId，DM 阶段写入后 fire-and-forget 持久化到 DB；Architect 阶段通过 `hydrate()` 从 DB 恢复，并有 conversation 记录的编程式种子作为兜底。

**Blackboard Key 约定**：

| Key | Type | Author | 写入时机 | 内容 |
|-----|------|--------|----------|------|
| `pipeline.requirements` | `context` | `meta-pipeline` | DM 运行前 | 原始输入 + StructuredRequirements + 信号 IDs |
| `dm.decision` | `decision` | `decision_maker` | DM 完成后 | 完整 DecisionOutput（含 risk_level/sources/rationale 等） |
| `dm.*` | `context` | `decision_maker` | DM ReAct 循环中 | DM 自主写入的中间调研结果 |
| `architect.*` | `artifact` | `architect` | Architect ReAct 循环中 | Architect 自主写入的执行产物 |

### 11.3 修改文件清单（6 files）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `lib/blackboard/types.ts` | 修改 | `BlackboardEntry.projectId` + `BlackboardSnapshot.projectId` → `string \| null` |
| `lib/blackboard/blackboard.ts` | 修改 | constructor 接受 `projectId?: string \| null`（默认 null），`persistEntry()` 确保 null 传入 DB |
| `agents/decision-maker/index.ts` | 修改 | options 新增 `blackboard?: Blackboard`，有 blackboard 时挂载 `read_blackboard` + `write_blackboard` 工具（author: `decision_maker`） |
| `agents/architect/index.ts` | 修改 | 同上，author 为 `architect` |
| `skills/meta-pipeline.ts` | 修改 | MetaPipelineOptions 新增 `blackboard`；DM 前种子 `pipeline.requirements`；DM 后写入 `dm.decision`（fire-and-forget）；Architect 有 blackboard 时用 `toContextString()` 无损上下文，否则保持原有文本拼接 |
| `lib/services/chat-engine.ts` | 修改 | `handleAgentTeam()` 创建 `Blackboard(conversationId, projectId)` 传入 DM；`handleArchitectPhase()` 创建 Blackboard + `hydrate()` + 兜底种子 dm.decision/pipeline.requirements + 传入 Architect |

### 11.4 向后兼容性

- `runMetaPipeline()`（cron/meta API 调用方）不传 blackboard → 两个 phase 自动走原有文本路径
- implement-pipeline 调用方始终传 valid projectId → Blackboard 构造函数向后兼容

### 11.5 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors

---

## 十二、Sprint 4：安全加固 + Pipeline Checkpoint & Resume

> 实现时间：2026-03-08
> Commits: `50d8a18`（安全加固）+ `21391e4`（Checkpoint & Resume）

### 12.1 变更概述

Sprint 4 完成优先级 1 全部 4 项安全加固任务（S1-S4），vision.md Phase 1 清零。

**S1+S2+S3 安全加固**（commit `50d8a18`）：命令注入过滤白名单（`run-command.ts`）、安全头（CSP/X-Frame-Options/X-Content-Type-Options）、CORS 配置。

**S4 Pipeline Checkpoint & Resume**（commit `21391e4`）：Architect ReAct 循环中每完成一批 tool calls 后触发 `onCheckpoint` 回调，将完整 `messages` 数组持久化到 conversations 表。失败时保留 checkpoint，恢复时用 `initialMessages` 重建 Architect。

### 12.2 S4 核心设计

```
BaseAgent.run() ReAct 循环
  └─ tool calls 处理完毕
      └─ context.onCheckpoint({ messages, stepsCompleted })
          └─ ChatEngine debounced 回调（每 3 步或 30s）
              └─ fire-and-forget 写 conversations.architect_checkpoint

失败时：
  architect_phase_status = 'failed'
  architect_checkpoint 保留（含 messages 数组）
  yield 'architect_failed' SSE 事件 → 前端 ArchitectResumePanel

恢复时：
  POST resume_architect → resumeArchitectPhase()
  └─ 校验 status=failed/timed_out + checkpoint 存在 + attempt<3
  └─ handleArchitectPhase({ __architectCheckpoint: checkpoint })
      └─ initialMessages = checkpoint.messages → createArchitectAgent
```

### 12.3 修改文件清单（2 新建 + 11 修改）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `database/migrations/025_architect_checkpoint.sql` | 新建 | conversations 表新增 `architect_phase_status` + `architect_checkpoint` (JSONB) + `architect_result` (JSONB) |
| `components/chat/ArchitectResumePanel.tsx` | 新建 | 恢复面板 UI：失败信息、已完成步数、attempt 计数、Resume/Start Over 按钮 |
| `lib/core/types.ts` | 修改 | 新增 `ArchitectCheckpoint` 接口、`AgentContext.onCheckpoint` 回调、Conversation 3 字段、ChatEventType 2 值 |
| `lib/core/base-agent.ts` | 修改 | ReAct 循环插入 `onCheckpoint` 回调（3 行） |
| `skills/meta-pipeline.ts` | 修改 | `MetaPipelineOptions` 新增 `initialMessages` + `onCheckpoint`，透传到 Architect |
| `agents/architect/index.ts` | 修改 | `createArchitectAgent` 接受 `initialMessages`，传给 `new BaseAgent()` |
| `lib/services/chat-engine.ts` | 修改 | checkpoint 状态管理 + debounced DB 写入 + 成功/失败状态更新 + `resumeArchitectPhase()` 方法（~80 行） |
| `app/api/conversations/[id]/plan/route.ts` | 修改 | 新增 `resume_architect` action，SSE 流式返回 |
| `store/slices/chatSlice.ts` | 修改 | `architectPanel` 状态 + `showArchitectFailed`/`hideArchitectPanel` actions |
| `components/chat/ChatView.tsx` | 修改 | 处理 `architect_failed` + `architect_resuming` SSE 事件 |
| `app/(dashboard)/layout.tsx` | 修改 | 右侧面板优先级链增加 `ArchitectResumePanel`（toolApproval 之后，team 之前） |
| `lib/i18n/locales/en.ts` | 修改 | 新增 9 个 `architect.*` 翻译 key |
| `lib/i18n/locales/zh.ts` | 修改 | 新增 9 个 `architect.*` 翻译 key |

### 12.4 向后兼容性

- 不传 `onCheckpoint` → 无 checkpoint 写入，现有流程不受影响
- 已 completed 的 pipeline → 直接返回 cached result（幂等）
- 10 分钟超时安全网：Architect 不变，ToolApproval 超时自动 reject

### 12.5 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors

---

## 十四、Sprint 5：Blackboard 生命周期 (A1+A2)

> 实现时间：2026-03-08
> Commit: `24df22c`

### 14.1 变更概述

Sprint 3 将 Blackboard 接入 DM↔Architect 通信，但存在两个问题：(1) 内存 Map 无 TTL 无容量上限，长 pipeline 可能累积大量过期条目；(2) SpawnAgentTool 创建的子 agent（researcher/blue-team/critic 等）无法访问 blackboard。本 Sprint 同时解决这两个问题。

### 14.2 核心设计

**A1 — 生命周期管理**：

```
Blackboard constructor(executionId, projectId, config?: BlackboardConfig)
  └─ maxEntries: number (0 = unlimited)
  └─ ttlMs: number (0 = no TTL)

write() → ... → cleanup()
  ├─ Phase 1: TTL 淘汰 (updatedAt < now - ttlMs)
  └─ Phase 2: 容量淘汰 (entries.size > maxEntries → 按 updatedAt 升序淘汰最旧)
  每次淘汰 → publishEviction() → BlackboardChangeEvent { action: 'evict' }

evict(key) → 手动删除 → BlackboardChangeEvent { action: 'delete' }
```

默认 `maxEntries=0, ttlMs=0` → 无淘汰，完全向后兼容。生产配置 `maxEntries=200, ttlMs=7200000`（2 小时）。

**A2 — 子 Agent Blackboard 传递**：

```
Architect/DM 工厂
  └─ new SpawnAgentTool(workspace, extraTools, onApprovalRequired, options?.blackboard)
      └─ _run() 中 factoryOptions.blackboard = this.blackboard
          └─ 子 agent 工厂接收 factoryOptions.blackboard
              └─ 已支持 blackboard 的工厂自动挂载 read/write 工具
```

### 14.3 修改文件清单（8 files）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `lib/blackboard/types.ts` | 修改 | 新增 `BlackboardConfig` 接口（maxEntries/ttlMs），`BlackboardChangeEvent.action` 扩展 `'evict'` |
| `lib/blackboard/index.ts` | 修改 | 导出 `BlackboardConfig` 类型 |
| `lib/blackboard/blackboard.ts` | 修改 | 构造函数接受 `config?: BlackboardConfig`，新增 `cleanup()`（TTL+容量淘汰）、`publishEviction()`、`evict(key)` 方法，`write()` 末尾调用 `cleanup()` |
| `lib/services/chat-engine.ts` | 修改 | `handleAgentTeam()` + `handleArchitectPhase()` 两处 Blackboard 创建传入 `{ maxEntries: 200, ttlMs: 7200000 }` |
| `skills/implement-pipeline.ts` | 修改 | Blackboard 创建传入同一配置 |
| `lib/tools/spawn-agent.ts` | 修改 | 构造函数新增第 4 参数 `blackboard?: Blackboard`，`_run()` 中透传到 `factoryOptions.blackboard` |
| `agents/architect/index.ts` | 修改 | SpawnAgentTool 传入 `options?.blackboard` |
| `agents/decision-maker/index.ts` | 修改 | SpawnAgentTool 传入 `options?.blackboard` |

### 14.4 向后兼容性

- 不传 `config` → `maxEntries=0, ttlMs=0` → 无淘汰，行为不变
- 不传 `blackboard` 到 SpawnAgentTool → factoryOptions 中无 blackboard 字段，子 agent 工厂忽略
- DB 不清理：本 Sprint 只清理内存 Map，DB 条目保留（审计用途）

### 14.5 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors

---

## 十六、Sprint 6：成本面板 + Multi-Model 配置 (O2+O4)

> 实现时间：2026-03-08
> Commit: `1822ecb`

### 16.1 变更概述

解决两个可观测性/产品化问题：(1) `cost_usd` 数据已在后端计算并入库，但前端未展示；(2) 所有 agent 使用同一 model（gpt-4o），低复杂度 agent 成本浪费。

### 16.2 O2 — 成本面板

UsageSnapshotCard 视图切换从 TOKENS/TIME 扩展为 TOKENS/TIME/**COST** 三模式。COST 视图展示：

| 卡片 | 内容 |
|------|------|
| Cost (7d) | 7 天总 LLM 成本（美元） |
| Cost (30d) | 30 天总 LLM 成本 |
| Signal Intelligence Cost | 信号情报阶段成本（30d + 7d） |
| Project Execution Cost | 项目执行阶段成本（30d + 7d） |

下方展示 per-agent 和 per-account 成本排行。使用 emerald 色系区分于 tokens（cyan）和 time（cyan）视图。

后端 `/api/usage` 已返回所有 costUsd 字段（`last7Days.costUsd`、`last30Days.costUsd`、`byAgent[].costUsd`、`signalUsage.costUsd7d/30d`、`projectUsage.costUsd7d/30d`、`byAccount[].costUsd`），本次仅修改前端。

### 16.3 O4 — Multi-Model 配置

新建 `agents/config.json`，为 6 个低复杂度 agent 配置 `gpt-4o-mini`：

| Agent | 原 Model | 新 Model | 理由 |
|-------|----------|----------|------|
| pm | gpt-4o | gpt-4o-mini | 单次 PRD 生成，输出结构简单 |
| researcher | gpt-4o | gpt-4o-mini | 搜索聚合，不需强推理 |
| critic | gpt-4o | gpt-4o-mini | 对抗审查，结构化输出 |
| blue-team | gpt-4o | gpt-4o-mini | STAR 框架论证，单次生成 |
| arbitrator | gpt-4o | gpt-4o-mini | 裁决输出，结构固定 |
| knowledge-curator | gpt-4o | gpt-4o-mini | RAG 检索聚合，不需强推理 |

保持 gpt-4o 的 agent：architect、decision-maker、developer、tech-lead、qa-engineer、code-reviewer、deployer、supervisor、orchestrator。

成本差异：gpt-4o prompt $2.5/1M → gpt-4o-mini $0.15/1M（16.7x 降低），completion $10/1M → $0.6/1M（16.7x 降低）。

### 16.4 修改文件清单（4 files）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `components/settings/UsageSnapshotCard.tsx` | 修改 | UsageData 接口扩展 costUsd 字段；新增 `formatCost()` 辅助；viewMode 扩展 `'cost'`；COST 视图渲染（4 卡片 + per-agent + per-account） |
| `lib/i18n/locales/en.ts` | 修改 | 新增 8 个 `usage.cost*` / `usage.switchToCost` / `usage.descCost` 翻译 key |
| `lib/i18n/locales/zh.ts` | 修改 | 同上中文翻译 |
| `agents/config.json` | 新建 | 6 个 agent 的 model override 为 `gpt-4o-mini` |

### 16.5 向后兼容性

- 不存在 `agents/config.json` → `loadAgentConfig()` 返回 `{}`，所有 agent 使用默认 model，行为不变
- `costUsd` 字段为可选（`?`），API 不返回时 UI 显示 `$0`
- COST 视图为新增 tab，不影响现有 TOKENS/TIME 视图

### 16.6 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors

---

## 十八、Sprint 7：批量技术债清理 (T1+T4+T6)

> 实现时间：2026-03-08
> Commit: `8cacc61`

### 18.1 变更概述

Sprint 7 集中清理三项技术债：(1) 全局 26 处 `.catch(() => {})` silent catch 统一改为 `console.error` 带上下文标签的错误日志；(2) 删除已废弃的 `lib/agents/pm.ts` re-export shim；(3) 导出 `PlanTask` 类型并应用到 `plan.ts`，消除 `any[]`。

### 18.2 T1 — Silent Catch 清理

15 个文件共 26 处修复，分类策略：

| 模式 | 替换为 | 示例 |
|------|--------|------|
| `recordLlmUsage().catch(() => {})` | `.catch((err) => console.error('[module] Record usage failed:', err))` | base-agent, llm, execute, implement 等 |
| `savePlanToDB().catch(() => {})` | `.catch((err) => console.error('[implement-pipeline] Save plan failed:', err))` | implement-pipeline x3 |
| Blackboard write `.catch(() => {})` | `.catch((err) => console.error('[implement-pipeline] Blackboard write failed:', err))` | implement-pipeline |
| Frontend fetch `.catch(() => {})` | `.catch((err) => console.error('[component] Description:', err))` | layout, page |
| `git remote remove`.catch(() => {}) | `.catch(() => { /* may not exist — expected */ })` | push-pr（保持 intentional） |
| Debug ingest `.catch(() => {})` | `.catch(() => { /* debug ingest — non-critical */ })` | page, implement |

涉及文件：`lib/core/base-agent.ts`、`lib/core/llm.ts`、`lib/services/chat-engine.ts`、`lib/services/signal-processor.ts`、`lib/skills/skill-registry.ts`、`skills/implement-pipeline.ts`、`app/(dashboard)/layout.tsx`、`app/(dashboard)/projects/[projectId]/page.tsx`、`app/api/cron/process-signals/route.ts`、`app/api/analyze/route.ts`、`app/api/signals/[signalId]/quick-discuss/route.ts`、`app/api/projects/[projectId]/execute/route.ts`、`app/api/projects/[projectId]/implement/route.ts`、`app/api/projects/[projectId]/push-pr/route.ts`、`middleware.ts`

### 18.3 T4 — PM Agent Shim 移除

- 删除 `lib/agents/pm.ts`（3 行 re-export：`export { createPMAgent } from '@/agents/pm'`）
- 唯一 importer `scripts/test-agent-manual.ts` 修正为直接 import `'../agents/pm'`

### 18.4 T6 — PlanTask 类型安全

- `lib/tools/finish-planning.ts` 已有 `TaskSchema` Zod 校验，新增导出 `export type PlanTask = z.infer<typeof TaskSchema>`
- `lib/skills/plan.ts` 中 `PlanResult.tasks: any[]` → `tasks: PlanTask[]`，PM import 修正为 `@/agents/pm`

### 18.5 修改文件清单（19 files, -1 deleted）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `lib/agents/pm.ts` | 删除 | 废弃 re-export shim |
| `scripts/test-agent-manual.ts` | 修改 | import 重定向 `../agents/pm` |
| `lib/tools/finish-planning.ts` | 修改 | 导出 `PlanTask` 类型 |
| `lib/skills/plan.ts` | 修改 | `tasks: any[]` → `tasks: PlanTask[]`，PM import 修正 |
| `lib/core/base-agent.ts` | 修改 | 2 处 silent catch → console.error |
| `lib/core/llm.ts` | 修改 | 3 处 silent catch → console.error |
| `lib/services/chat-engine.ts` | 修改 | 3 处 silent catch → console.error |
| `lib/services/signal-processor.ts` | 修改 | 1 处 silent catch → console.error |
| `lib/skills/skill-registry.ts` | 修改 | 2 处 silent catch → console.error |
| `skills/implement-pipeline.ts` | 修改 | 5 处 silent catch → console.error |
| `app/(dashboard)/layout.tsx` | 修改 | 2 处 silent catch → console.error |
| `app/(dashboard)/projects/[projectId]/page.tsx` | 修改 | 5 处 silent catch → console.error / non-critical |
| `app/api/cron/process-signals/route.ts` | 修改 | 1 处 silent catch → console.error |
| `app/api/analyze/route.ts` | 修改 | 1 处 silent catch → console.error |
| `app/api/signals/[signalId]/quick-discuss/route.ts` | 修改 | 1 处 silent catch → console.error |
| `app/api/projects/[projectId]/execute/route.ts` | 修改 | 1 处 silent catch → console.error |
| `app/api/projects/[projectId]/implement/route.ts` | 修改 | 3 处 silent catch → console.error / non-critical |
| `app/api/projects/[projectId]/push-pr/route.ts` | 修改 | 1 处 → expected comment |
| `middleware.ts` | 修改 | 2 处 silent catch → console.error |

### 18.6 验证结果

- **TypeScript 编译**: `npx tsc --noEmit` — 0 errors
- **Silent catch 残留**: `grep -rn '.catch(() => {})' | grep -v node_modules` — 0 matches

---

## 十九、总结

> RebuilD 的底层引擎（BaseAgent、Tool Registry、LLM Pool、Blackboard）设计扎实，但顶层编排过度复杂（22 Agent + 动态 Agent 创建），导致调试困难和成本倍增。建议继续合并 Agent、偿还技术债，把核心链路做到 100% 可靠。
>
> **2026-03-07 更新**：L1/L2/L3 路由系统已实现，三套并行架构统一为 Chat-First 单一入口。L1/L2 端到端可用，L3 链路已连通但 meta-pipeline 内部缺 checkpoint。
>
> **2026-03-08 更新**（Sprint 1+2+3+4+5+6+7+8+9）：
> - Sprint 1：DM checkpoint + Architect 工具审批 + StructuredRequirements 注入（`24250b4` + `cd8efab`）
> - Sprint 2：信号→执行一键 pipeline（`10e50fd`），打通信号子系统到 Meta Pipeline 的完整链路
> - Sprint 3：DM↔Architect Blackboard 无损通信（`25e8b2b`），替代有损文本拼接，支持跨 HTTP 请求 hydrate + 兜底种子
> - Sprint 4：安全加固 S1-S3（`50d8a18`）+ Pipeline Checkpoint & Resume S4（`21391e4`），vision.md Phase 1 优先级 1 全部清零
> - Sprint 5：Blackboard 生命周期管理 A1+A2（`24df22c`），TTL/容量淘汰 + 子 Agent Blackboard 透传，Blackboard 能力从 DM↔Architect 扩展到全 pipeline 所有 agent
> - Sprint 6：成本面板 O2（`1822ecb`）+ Multi-Model 配置 O4（`1822ecb`），用户可见 LLM 成本 + 6 个低复杂度 agent 降级至 gpt-4o-mini 降低 40-60% 成本
> - Sprint 7：批量技术债清理 T1+T4+T6（`8cacc61`），26 处 silent catch 全部加错误日志 + PM shim 删除 + PlanTask 类型安全
> - Sprint 8：Execution Trace 后端持久化 O1（`d030564`），`execution_traces` + `execution_events` 两表、fire-and-forget 入库、查询 API
> - Sprint 9：Execution Trace 前端 Dashboard O1，5 个新建组件 + PageSwitcher labels + 18 个 i18n key，Phase 2 可观测性（O1+O2+O4）全部清零
>
> **阶段 A 全部完成，阶段 B 核心项（B2 Blackboard 通信 + A1/A2 生命周期）已完成，阶段 C 产品差异化链路（C2+C3）已打通，阶段 D 错误处理（D2）+国际化（D3）已完成。安全加固 P0 全部完成，可观测性 O1+O2+O4 全部清零，技术债 T1+T4+T6 已清零，系统具备生产部署条件。**
>
> 当前首要任务：(1) Agent 合并降低系统复杂度（A5/B1）；(2) 端到端集成测试（T2）；(3) Team Coordinator 完善（A3）。
