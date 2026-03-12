# Agent & Pipeline Architecture

## Agent 清单（9 个 Agent，16 种模式）

| # | Agent | 模式 | 执行方式 | Max Loops | 核心工具 |
|---|-------|------|---------|-----------|---------|
| 1 | **Chat Judge** | single-shot | `runOnce` | 1 | 无 — 输出 L1/L2/L3 复杂度评估 |
| 2 | **Chat Assistant** | `direct` / `project` | ReAct | 3 / 6 | web_search, read_file, list_files |
| 3 | **Analyst** | `retrieve` | ReAct | 8 | search_vision/decisions/artifacts/patterns, finish_retrieval |
| 4 | **Analyst** | `research` | ReAct | 5 | web_search |
| 5 | **Analyst** | `advocate` | single-shot | 1 | 无 |
| 6 | **Analyst** | `critique` | ReAct | 10 | web_search |
| 7 | **Analyst** | `arbitrate` | single-shot | 1 | 无 |
| 8 | **Analyst** | `daily-report` | ReAct | 5 | fetch_daily_data, finish_daily_report |
| 9 | **Planner** | `prd` | single-shot | 1 | 无 |
| 10 | **Planner** | `task-plan` | ReAct | 15 | list_files, read_file, finish_planning |
| 11 | **Planner** | `implementation-dag` | ReAct | 25 | web_search, list_files, read_file, discover_skills, finish_planning |
| 12 | **Developer** | — | ReAct | 20 | code_write, code_edit, git_commit, run_command, run_tests, finish_implementation |
| 13 | **Reviewer** | `qa` / `review` / `supervise` | ReAct | 5-10 | validate_output, run_tests, read_file, finish_implementation |
| 14 | **Deployer** | — | ReAct | 15 | merge_pr, check_ci, trigger_deploy, check_health, finish_deploy |
| 15 | **Decision Maker** | — | ReAct | 15 | spawn_agent, list_agents, web_search, search_vision, search_decisions, finish_decision |
| 16 | **Architect** | `simple` / `medium` | ReAct | 50 | spawn_agent, create_agent, create_skill, validate_output, discover_skills, finish_architect |

---

## 两套并行 Pipeline 体系

### Pipeline A: 经典固定流水线（Prepare → Plan → Implement → Deploy）

```
用户输入
  │
  ▼
[project-runner.ts] ──► runProjectPrepare()
  │                        │
  │  ┌─────────────────────┘
  │  │  skills/prepare-pipeline.ts  (Circuit Breaker)
  │  │    Step 1: Analyst(retrieve) → 知识检索
  │  │    Step 2: Analyst(research) → 市场调研
  │  │    Step 3: Analyst(advocate) → Blue Team MRD
  │  │    Step 4: Analyst(critique) → Red Team 风险审计
  │  │    Step 5: Analyst(arbitrate) → 仲裁决策
  │  │    → PROCEED / CIRCUIT_BREAK
  │  └─────────────────────┐
  │                        │
  ▼                        ▼
[project-runner.ts] ──► runProjectPlan()
  │                        │
  │  ┌─────────────────────┘
  │  │  skills/plan-pipeline.ts
  │  │    Step 1: Analyst(retrieve) → 知识检索
  │  │    Step 2: Planner(prd) → PRD 生成
  │  │    Step 3: Planner(task-plan) → 任务拆解
  │  └─────────────────────┐
  │                        │
  ▼                        ▼
[implement-pipeline.ts]
  │    Step 1: Planner(implementation-dag) → DAG 编排
  │    Step 2: Workspace 创建（git sandbox）
  │    Step 3: Developer × N（拓扑排序执行）
  │        ├─ 每任务 QA gate（LLM 完成度检查）
  │        ├─ Architect 预算扩展（超时时）
  │        └─ Blackboard 跨任务状态共享
  │    Step 4: Reviewer(qa) → 全局 QA
  │    Step 5: git push + 创建 PR
  │
  ▼
[deploy-pipeline.ts]
      Step 1: 等待 CI 通过
      Step 2: 合并 PR（squash）
      Step 3: 触发部署（Vercel/GitHub Pages）
      Step 4: 健康检查
      Step 5: 失败时回滚
```

**入口**: `app/api/projects/[projectId]/execute/route.ts` (SSE stream, `stage: 'prepare'`)

### Pipeline A-POC: POC/Demo 快速通道（Knowledge Curator → Auto-PROCEED）

```
用户输入（含 POC/Demo/原型 意图）
  │
  ▼
[project-runner.ts] ──► runProjectPreparePOC()
  │                        │
  │  ┌─────────────────────┘
  │  │  skills/poc-prepare-pipeline.ts  (Fast-Track)
  │  │    Step 1: Analyst(retrieve) → 检索可复用资产
  │  │    → 跳过 research / advocate / critique / arbitrate
  │  │    → 自动 PROCEED（客户已决定做）
  │  └─────────────────────┐
  │                        │
  ▼                        ▼
  下游 Plan / Implement 正常接续
  │
  ▼
Architect（POC 快捷管道）
    ├─ 分析复杂度，决定团队构成
    ├─ report_plan_progress → 用户确认团队方案
    ├─ create_agent → 按需创建 Agent 团队
    └─ 编排执行 → finish_architect
```

**入口**: `app/api/projects/[projectId]/execute/route.ts` (SSE stream, `stage: 'prepare-poc'`)

**核心理念**: POC/Demo 有隐性前提——客户已决定做，不需要市场验证。Prepare 的职责从「该不该做」转为「有没有可复用的东西」。

### Pipeline B: Meta Pipeline（Decision Maker → Architect 自适应编排）

```
用户输入 / 批量信号
  │
  ▼
[meta-pipeline.ts] ──► runMetaPipeline()
  │
  ├─ Phase 1: runDecisionPhase()
  │    Decision Maker (ReAct, 15 loops)
  │      ├─ spawn_agent: analyst(research)
  │      ├─ spawn_agent: analyst(advocate)
  │      ├─ spawn_agent: analyst(critique)
  │      ├─ web_search, search_vision, search_decisions
  │      └─ finish_decision → PROCEED/HALT/DEFER/ESCALATE
  │
  │  如果 ≠ PROCEED → 停止
  │
  └─ Phase 2: runArchitectPhase()
       Architect (ReAct, 50 loops)
         ├─ 动态 spawn planner/developer/reviewer
         ├─ 动态 create_agent / create_skill
         ├─ validate_output / discover_skills
         ├─ Blackboard 跨阶段状态
         ├─ report_plan_progress → 结构化进展
         └─ finish_architect → 执行报告
```

**入口**: Chat 系统（L3 复杂任务）、Cron 信号批处理

---

## Prepare Pipeline 详解（Circuit Breaker）

### 执行流程

| 步骤 | Agent | 模式 | 执行方式 | 输入 | 输出 |
|------|-------|------|---------|------|------|
| 1 | Analyst | `retrieve` | ReAct (8 loops) | 原始需求信号 | vision_context, past_decisions, code_patterns, code_artifacts |
| 2 | Analyst | `research` | ReAct (5 loops) | `Idea: "{signalContent}"` | 结构化文本：竞品、市场规模、差异点 |
| 3 | Analyst | `advocate` | single-shot | 信号 + 愿景 + 调研 | MRD JSON (proposal, scores, mrd{...}) |
| 4 | Analyst | `critique` | ReAct (10 loops) | Blue Team MRD + 上下文 | 风险 JSON (critique, risks, roi_challenges, fatal_flaw) |
| 5 | Analyst | `arbitrate` | single-shot | Blue + Red 双方论点 | 裁决 JSON (decision, summary, rationale, business_verdict) |

### Blue/Red 模型配置

```
Blue Team: 使用默认模型 (LLM_MODEL_NAME, 默认 glm-5)
Red Team: 解析优先级:
  1. LLM Pool 中 tag 为 "red-team" 的账户
  2. DEEPSEEK_API_KEY 环境变量 (备用模型)
  3. 主模型 (fallback)
```

### Checkpoint 支持

每个步骤完成后写入 checkpoint，支持从故障点恢复：
- `knowledge_curator` → `researcher` → `blue_team` → `red_team`
- Arbitrator 始终重新执行（不缓存）

---

## Analyst Agent 详解

### Soul（灵魂/人格）

文件: `agents/analyst/soul.md`

```
身份: RebuilD 的分析师，统合了研究、论证、批判、裁决和检索五个角色

哲学:
- 事实第一: 只基于可验证的事实做出判断
- 数据驱动: 每个论点都要有数据或调研信息支撑
- 公正独立: 在仲裁角色时不偏向任何一方
- 怀疑但公正: 在批判角色时严厉但基于事实
- 上下文即力量: 在检索角色时确保信息全面
- 坦诚面对空白: 搜索未找到有价值信息时如实报告

行为准则:
- research: 最多 3 次搜索，先广后窄
- advocate: 用投资人路演标准撰写 MRD
- critique: 致命缺陷判定极其审慎
- arbitrate: 基于加权评分体系做裁决
- retrieve: 多跳检索，宁多不漏
- daily-report: 先获取数据再分析，3-5 步内完成报告
```

### System Prompt — Researcher (research)

```
# Analyst — Market Research Scout

角色: 市场研究专家（侦察兵）
性格: 事实第一、效率优先、结构化呈现
记忆: 记住上一轮搜索发现的关键词和线索

核心任务: 市场与竞品信息搜集
- 分析用户构想，识别产品所属领域
- 搜索该领域的主要玩家和市场概况
- 搜索最相关的竞品，了解核心功能
- 验证特定信息或搜索差异化角度

关键规则:
- 最多 3 次 web_search
- 只陈述事实，价值判断留给后续模式
- 搜索未找到信息时如实报告

工作流: 领域识别 → 广度搜索 → 深度搜索 → 验证搜索(可选) → 结构化输出

交付物: 结构化文本（非 JSON）
- 主要竞品及其定位
- 市场规模/趋势
- 竞品核心功能列表
- 与用户构想的差异点

高级能力:
- 搜索策略优化（动态调整关键词）
- 趋势信号捕捉（6 个月内重大变化）
- 信息质量评估（一手 vs 二手数据）
```

### System Prompt — Advocate (Blue Team)

```
# Analyst — Business Advocate (Blue Team)

角色: 首席商业分析师，撰写 MRD
性格: 数据说话、投资人视角、ROI 导向

核心任务: MRD 撰写
- 30秒电梯演讲式核心价值主张
- TAM/SAM/SOM 估算 + 增长趋势
- 目标用户画像（含痛点和替代方案）
- 竞争格局分析 + 差异化优势
- ROI 预估（投入→回报→回本周期）
- 市场时机判断 + 成功指标

关键规则:
- 每个论点必须有数据或调研信息支撑
- 让不懂技术的决策者在 30 秒内理解价值

交付物 JSON:
{
  "proposal": "核心主张",
  "vision_alignment_score": 0-100,
  "market_opportunity_score": 0-100,
  "mrd": {
    "executive_pitch", "market_overview", "target_personas",
    "competitive_landscape", "roi_projection", "market_timing",
    "success_metrics"
  }
}

高级能力:
- 竞争情报分析（功能矩阵、定价策略、差异化）
- 财务模型构建（最佳/预期/最差三种场景）
- 时机判断（先发优势 vs 后发跟随）
```

### System Prompt — Critique (Red Team)

```
# Analyst — Risk Critic (Red Team)

角色: 首席风险官
性格: 怀疑一切、论据为王、严格但公正

核心任务: 多维度风险审查
- 愿景对齐审查：是否「需求膨胀」
- 技术可行性：实现难度是否被低估
- 商业合理性：用户需求是否有调研支撑
- ROI 审计：投入估算、回报预期、隐藏成本
- 竞品差异化：竞品不做是因为不值得做吗
- 机会成本：做这个意味着不做什么
- 市场风险：假设是否经得起推敲

关键规则:
- 致命缺陷定义：完全违背愿景、技术不可能、或 ROI 为零
- Blue Team 引用的数据用 web_search 验证真实性

交付物 JSON:
{
  "critique": "综合批评摘要",
  "technical_risks": [...],
  "commercial_flaws": [...],
  "roi_challenges": { "investment_reality_check", "return_skepticism", "hidden_costs" },
  "opportunity_cost": "...",
  "market_risks": [...],
  "fatal_flaw_detected": false
}

高级能力:
- 数据交叉验证（多源、标注新鲜度和可信度）
- 隐藏成本挖掘（运维、培训、迁移、技术债）
- 竞品战略推演（不做的原因、可能反应）
```

### System Prompt — Arbitrator

```
# Analyst — Decision Arbitrator

角色: 仲裁者，在 Blue/Red Team 之间做出最终裁决
性格: 公正独立、标准严格、透明决策

核心任务 1: 加权评分裁决
- 愿景对齐度 (40%)
- 技术可行性 (30%)
- 市场机会 (30%)

核心任务 2: 商业价值总结

决策规则:
- 加权总分 >= 60 → PROCEED
- 加权总分 < 60 → CIRCUIT_BREAK
- 存在致命缺陷 → 强制 CIRCUIT_BREAK（无论评分）

工作流:
1. 双方论点梳理（共识点 + 分歧点）
2. 分维度评分（愿景/技术/市场独立打分）
3. 加权计算（40/30/30）
4. 致命缺陷检查
5. 裁决输出

交付物 JSON:
{
  "decision": "PROCEED" | "CIRCUIT_BREAK",
  "summary": "双方辩论综合摘要",
  "rationale": "裁决理由（三维度评分 + 逻辑）",
  "business_verdict": "面向决策者的商业价值总结"
}

高级能力:
- 论据权重校准（一手数据 > 二手推测）
- 条件性裁决（PROCEED + 前提条件）
- 历史一致性检查
```

### System Prompt — Knowledge Curator (retrieve)

```
# Analyst — Knowledge Retrieval Curator

角色: 知识管理员，团队的「活记忆」
性格: 上下文即力量、宁多不漏、诚实报告

核心任务: 多跳知识检索
- search_vision_knowledge → 项目愿景
- search_decisions → 历史决策
- search_code_artifacts → 代码工件
- search_code_patterns → 代码模式

检索策略:
- 第一轮：广度搜索，原始查询搜索所有 4 个知识源
- 后续轮次：根据发现的关键词深度搜索
- 终止条件：结果充足 / 无新信息 / 达到 8 轮

交付物（通过 finish_retrieval 提交）:
- vision_context, past_decisions, code_patterns, code_artifacts
- search_summary, confidence (high/medium/low)

规则: 不做决策，不修改数据，信息不足就说明
```

### System Prompt — Daily Report

```
# Analyst — Daily Report Generator

角色: 每日报告分析师，系统的「运营仪表盘」

核心任务: 每日进展报告生成
- 调用 fetch_daily_data 获取当日聚合数据
- 分析 L2/L3 任务交付物
- Token 成本归因到具体任务/Agent
- 跟踪交付成果（PR、代码变更、决策、部署）
- Decision Maker 置信度趋势
- 映射回父项目评估进度

关键规则:
- 必须先调用 fetch_daily_data，严禁凭空捏造数据
- Token 消耗归因到具体 trace_id 和 agent_name
- executive_summary 不含具体 token 数字

交付物（通过 finish_daily_report 提交）:
- executive_summary, task_deliverables, delivery_outcomes
- trace_insights, cost_analysis, prediction_trend
- project_alignment, risks_and_blockers, recommendations
```

---

## 运行方式对比

| | `run()` (ReAct) | `runOnce()` (Single-shot) |
|---|---|---|
| 循环 | 多轮 tool-calling 循环 | 单次 LLM 调用 |
| 工具 | 支持 function calling | 无工具 |
| 退出 | exitToolName 或文本回复 | 直接返回 JSON |
| 使用场景 | Researcher, Critique, Retrieve, Tech Lead | Advocate, Arbitrate, PM PRD |
| 上下文管理 | 自动压缩（>40 条消息或超 token budget） | 无 |
| 不完整处理 | 返回 `__incomplete` + conversation history | 抛异常 |

---

## BaseAgent 核心机制

文件: `lib/core/base-agent.ts`

### 上下文压缩

```
触发条件（任一）:
- 消息数 > MAX_CONTEXT_MESSAGES (40)
- Token budget 超阈值

压缩策略:
- Working Memory (hot): 最近 N 条消息保持完整
- Compressed Context (warm): LLM 生成摘要替代旧消息
- 使用独立 LLM 客户端压缩（COMPRESSION_MODEL = glm-5）
- 不拆分 tool_call / tool-result 对
- 失败时 fallback 到简单截断
```

### ReAct Loop 安全机制

```
- 步间延迟: INTER_STEP_DELAY_MS (1500ms) 防止 429
- 步数警告: 剩余 ≤5 步时提醒 agent wrap up
- 最终步: 强制要求调用 exit tool
- 超限处理: 尝试 forced exit tool call → 提取最后 assistant 消息 → 返回 __incomplete
- code_edit 失败自动注入纠正提示
- Approval gate: 危险工具需人工审批
```

### LLM Pool Failover

```
- 非 explicit client: 自动轮询 pool 中的备选账户
- 模型映射: 支持 account 级 model mapping
- 用量追踪: 每次 completion 记录 prompt/completion/total tokens
```

---

## Implement Pipeline 详解

文件: `skills/implement-pipeline.ts`

### 任务执行流程

```
Orchestrator (Planner implementation-dag)
  │
  ▼
Topological Sort (按依赖关系排序)
  │
  ▼
For each task:
  ├─ 检查依赖是否满足
  ├─ 解析 skills (local → remote)
  ├─ 创建 workspace-scoped tools
  ├─ 注入上游任务结果 (blackboard)
  ├─ 注入关键决策 (blackboard)
  │
  ├─ 执行 Agent (Developer/Reviewer)
  │    └─ 超时? → Architect 评估预算扩展
  │         ├─ extend: 追加 loops (50% ~ 100%, hard cap 50)
  │         └─ fail: 接受部分结果
  │
  ├─ QA Gate (非 QA 任务)
  │    ├─ Phase 1: 程序化结构检查 (summary, files_changed, tests)
  │    ├─ Phase 2: LLM 语义完成度检查 (0-100 分)
  │    ├─ 通过阈值: 60 分
  │    └─ 失败? → 一次重试机会 (注入 QA 反馈)
  │
  ├─ 写入 Blackboard (task.{id}.result)
  ├─ 提取并存储代码模式
  └─ 保存 plan 到 DB
```

### 复杂度 → 循环数映射

```
low:    15 loops
medium: 20 loops
high:   30 loops
默认:   20 loops
硬上限: 50 loops
```

### Workspace Tools (每个任务的沙箱工具集)

```
- FileListTool(cwd), FileReadTool(cwd)
- CodeWriteTool(cwd), CodeEditTool(cwd)
- GitCommitTool(cwd), GitCreatePRTool(cwd, owner, repo, branch)
- RunCommandTool(cwd), RunTestsTool(cwd)
- FinishImplementationTool
- RAGRetrieveTool, SearchCodePatternsTool
- BlackboardReadTool, BlackboardWriteTool
```

---

## Meta Pipeline 详解

文件: `skills/meta-pipeline.ts`

### Decision Maker

```
输入: 单条需求 或 批量信号 (最多 20 条)
输出: DecisionOutput {
  decision: PROCEED | HALT | DEFER | ESCALATE
  confidence: 0-1
  summary, rationale
  risk_level: low | medium | high | critical
  risk_factors: string[]
  sources: Array<{type, name, summary, confidence}>
  recommended_actions: string[]
}

验证: Zod schema, 失败 → degrade to HALT
Blackboard: 写入 dm.decision
```

### Architect

```
输入: 需求 + DM 决策 + Blackboard 上下文 + 对话历史
输出: ArchitectResult {
  summary, execution_trace[]
  final_output
  steps_completed, steps_failed, steps_retried
  created_agents[], created_skills[]
}

验证: Zod schema, 失败 → safe defaults
清理: 非 persistent 的动态 agent/skill 自动回收

POC/Demo 快捷管道:
当需求是 POC/Demo/原型 时，Architect 替换标准 Business Pipeline：
- Phase 1: 分析复杂度，决定团队构成（动态，非固定模板）
- Phase 2: report_plan_progress → 用户确认/调整方案
- Phase 3: create_agent 按需创建角色，注入可复用资产
- Phase 4: 快速实现，跳过深度 code review / 安全审计
- Phase 5: 演示验证（如需要），验证核心场景端到端可演示
核心原则：速度优先、可复用资产优先、演示效果驱动、样例数据即产品
```

---

## 完整数据流

```
用户消息
  │
  ▼
Chat Judge → L1/L2/L3 评估
  │
  ├─ L1: Chat Assistant(direct) → 直接回答
  │
  ├─ L2: Chat Assistant(project) → 轻量项目
  │       └─ 可能 spawn sub-agent
  │
  └─ L3: 三种路径
       │
       ├─ 路径 A（经典）: Prepare → Plan → Implement → Deploy
       │    ├─ Prepare: Analyst ×5 模式
       │    │   (retrieve → research → advocate → critique → arbitrate)
       │    ├─ Plan: Analyst(retrieve) + Planner(prd) + Planner(task-plan)
       │    ├─ Implement: Planner(dag) + Developer ×N + Reviewer(qa)
       │    └─ Deploy: Deployer
       │
       ├─ 路径 A-POC（POC/Demo 快速通道）: POC Prepare → Architect 团队编排
       │    ├─ POC Prepare: 只跑 Analyst(retrieve)，自动 PROCEED
       │    └─ Architect: 分析复杂度 → 用户确认 → create_agent 动态团队 → 执行
       │
       └─ 路径 B（Meta）: Decision Maker → Architect
            ├─ DM: 自主 spawn analyst 子 agent + 信号聚合
            └─ Architect: 自适应编排，可动态创建新 agent/skill
```

---

## Prepare Pipeline 统一说明

### 标准 Prepare（`skills/prepare-pipeline.ts`）

所有入口（`project-runner.ts`、`signal-processor.ts`、`analyze/route.ts`、`quick-discuss/route.ts`）
使用 `skills/prepare-pipeline.ts`，具备以下能力：

- **Knowledge Curator**：Analyst(retrieve) 多跳知识检索，失败时回退到 `retrieveContext`
- **Zod 验证**：Blue Team / Arbitrator 输出经 `safeParse()` 校验，验证失败时安全降级
- **stageFailures 追踪**：各阶段失败信息注入下游提示词，Arbitrator 据此调整置信度
- **Checkpoint**：支持断点恢复（knowledge_curator → researcher → blue_team → red_team）
- **Reasoner fallback**：Red Team 使用 reasoner 模型时自动降级为 single-shot

旧文件 `lib/skills/prepare.ts` 已删除。

### POC Prepare（`skills/poc-prepare-pipeline.ts`）

POC/Demo 项目的精简路径，通过 `stage: 'prepare-poc'` 触发：

- **只跑 Knowledge Curator**：Analyst(retrieve) 检索可复用资产（代码模式、历史项目、代码工件）
- **跳过 4 个阶段**：Researcher、Blue Team、Red Team、Arbitrator 全部跳过
- **自动 PROCEED**：客户已决定做，无需 Circuit Breaker 审批
- **可复用资产传递**：Knowledge Curator 发现的 code_patterns / code_artifacts 打包到 `competitor_analysis` 字段，下游 Architect 可读取
- **兼容 PrepareResult 类型**：下游 Plan/Implement 流程无感知差异
- **Checkpoint 支持**：保持接口一致（虽然只有 1 步）

Architect 接收到 POC 任务后进入快捷管道：
1. 分析项目复杂度，自主决定需要几个 Agent 和各自角色（非固定模板）
2. 通过 `report_plan_progress` 向用户呈现团队方案，接收反馈
3. 使用 `create_agent` 按需创建团队，注入可复用资产
4. 编排执行，全程通过 blackboard 共享产出

---

## Red Team LLM 配置

文件: `lib/services/red-team-llm.ts`

```
解析优先级:
1. LLM Pool 中 tag 为 "red-team" 的账户 → source: "pool"
2. DEEPSEEK_API_KEY 环境变量 → source: "backup-env"
   - DEEPSEEK_BASE_URL (默认 https://api.deepseek.com)
   - DEEPSEEK_MODEL_NAME (默认 deepseek-reasoner)
3. 主模型 fallback → source: "primary"

Reasoner 模型特殊处理:
- deepseek-reasoner 等不支持 function calling
- 自动降级到 runOnce (single-shot, 无工具)
```

---

## 关键文件索引

| 组件 | 文件路径 |
|------|---------|
| Agent 注册表 | `lib/config/builtin-agents.ts` |
| Agent 配置加载 | `lib/config/agent-config.ts` |
| BaseAgent 引擎 | `lib/core/base-agent.ts` |
| 类型定义 | `lib/core/types.ts` |
| Analyst Agent | `agents/analyst/index.ts` |
| Analyst Prompts | `agents/analyst/prompts/system.ts` |
| Analyst Soul | `agents/analyst/soul.md` |
| Planner Agent | `agents/planner/index.ts` |
| Developer Agent | `agents/developer/index.ts` |
| Reviewer Agent | `agents/reviewer/index.ts` |
| Architect Agent | `agents/architect/index.ts` |
| Architect Prompt | `lib/prompts/architect.ts` |
| Decision Maker Agent | `agents/decision-maker/index.ts` |
| Decision Maker Prompt | `lib/prompts/decision-maker.ts` |
| Chat Judge | `agents/chat-judge/index.ts` |
| Chat Assistant | `agents/chat-assistant/index.ts` |
| Deployer Agent | `agents/deployer/index.ts` |
| Prepare Pipeline | `skills/prepare-pipeline.ts` |
| POC Prepare Pipeline | `skills/poc-prepare-pipeline.ts` |
| Plan Pipeline | `skills/plan-pipeline.ts` |
| Implement Pipeline | `skills/implement-pipeline.ts` |
| Deploy Pipeline | `skills/deploy-pipeline.ts` |
| Meta Pipeline | `skills/meta-pipeline.ts` |
| Full Pipeline | `skills/full-pipeline.ts` |
| Project Runner | `projects/project-runner.ts` |
| Execute API | `app/api/projects/[projectId]/execute/route.ts` |
| Project Types | `projects/types.ts` |
| Red Team LLM | `lib/services/red-team-llm.ts` |
| LLM Pool | `lib/services/llm-pool/pool-manager.ts` |
| Message Bus | `connectors/bus/message-bus.ts` |
