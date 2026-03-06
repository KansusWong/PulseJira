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

## 四、总结

> RebuilD 的底层引擎（BaseAgent、Tool Registry、LLM Pool、Blackboard）设计扎实，但顶层编排过度复杂（22 Agent + 3 套并行架构 + 动态 Agent 创建），导致没有一条端到端路径是完全可用的。建议砍掉 80% 的 Agent 和未完成的架构分支，把"信号 -> 决策 -> 任务"这条独特链路做到 100% 可靠，再逐步扩展。
