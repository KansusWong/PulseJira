# Agent 设计文档

## 概览

当前项目共有 **11 个 Agent**，其中 **9 个内置 Agent** + **2 个 AI 动态生成的 Agent**。

项目经历过 Sprint 13 的整合，从 16 个 Agent 精简为 8 个核心 Agent（通过多模式合并），后续新增 Architect 及 2 个动态 Agent。

---

## 内置 Agent（9 个）

| # | Agent ID | 名称 | 作用 | 运行模式 | 最大循环 |
|---|----------|------|------|---------|---------|
| 1 | `planner` | Planner | 需求 → PRD → 任务拆解 → 实现 DAG | ReAct | 25 |
| 2 | `analyst` | Analyst | 信号评估全链路：研究/论证/批判/裁决/检索 | ReAct | 10 |
| 3 | `reviewer` | Reviewer | 质量门控全链路：测试/代码审查/产出验证 | ReAct | 10 |
| 4 | `chat-assistant` | Chat Assistant | 通用对话助手，处理 L1 直接问答和 L2 轻量项目任务 | ReAct | 3 |
| 5 | `chat-judge` | Chat Judge | 用户需求复杂度评估（L1/L2/L3），内部隐藏 Agent | Single-shot | 1 |
| 6 | `developer` | Developer | 根据任务描述生成代码 | ReAct | 20 |
| 7 | `deployer` | Deployer | GitHub 分支管理与项目部署 | ReAct | 15 |
| 8 | `decision-maker` | Decision Maker | 收集高价值信息并输出结构化决策 | ReAct | 15 |
| 9 | `architect` | Architect | 自适应执行引擎，动态编排 Agent/Skill/工具 | ReAct | 50 |

## 动态生成 Agent（2 个，由 Architect 创建）

| # | Agent ID | 名称 | 作用 | 运行模式 | 最大循环 |
|---|----------|------|------|---------|---------|
| 10 | `lead-miner` | [AI] Lead Miner | 根据产品关键词搜索潜在客户和商业机会 | ReAct | 8 |
| 11 | `email-composer` | [AI] Email Composer | 根据潜在客户信息生成个性化触达邮件 | Single-shot | 1 |

---

## 各 Agent 详细说明

### 1. Planner

- **文件路径：** `agents/planner/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **角色合并：** PM + Tech Lead + Orchestrator
- **子模式：**
  - `prd` — Product Manager，单次生成 PRD
  - `task-plan` — Tech Lead，ReAct 循环进行任务规划
  - `implementation-dag` — Orchestrator，ReAct 循环构建实现 DAG
- **工具：** web_search, list_files, read_file, finish_planning

### 2. Analyst

- **文件路径：** `agents/analyst/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **角色合并：** Researcher + Blue Team + Critic + Arbitrator + Knowledge Curator
- **子模式：**
  - `research` — 市场调研侦察（ReAct, maxLoops 5, 工具: web_search）
  - `advocate` — 商业论证/蓝队（Single-shot, maxLoops 1）
  - `critique` — 风险审计/红队（ReAct, maxLoops 10, 工具: web_search）
  - `arbitrate` — 决策仲裁（Single-shot, maxLoops 1）
  - `retrieve` — 知识检索/多跳检索（ReAct, maxLoops 8）
- **工具：** web_search, search_vision_knowledge, search_decisions, search_code_artifacts, search_code_patterns, finish_retrieval

### 3. Reviewer

- **文件路径：** `agents/reviewer/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **角色合并：** QA Engineer + Code Reviewer + Supervisor
- **子模式：**
  - `qa` — QA 工程师，验证代码、运行测试
  - `review` — 代码审查者，审查代码变更
  - `supervise` — 监督者，验证 Agent 产出（maxLoops 5）
- **工具：** list_files, read_file, run_tests, run_command, validate_output, finish_implementation

### 4. Chat Assistant

- **文件路径：** `agents/chat-assistant/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **子模式：**
  - `direct` — L1 直接问答（默认）
  - `project` — L2 轻量项目任务，支持子 Agent 委派
- **工具：** web_search, read_file, list_files

### 5. Chat Judge

- **文件路径：** `agents/chat-judge/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **内部 Agent：** 不在管理 UI 中展示
- **用途：** 评估用户请求的复杂度级别（L1/L2/L3），决定路由到哪个执行流程
- **前身：** 原名 complexity-assessor

### 6. Developer

- **文件路径：** `agents/developer/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **用途：** 核心编码 Agent，通过 ReAct 循环完成：探索代码库 → 生成代码 → 运行测试 → Git 提交
- **工具：** list_files, read_file, code_write, code_edit, run_command, run_tests, git_commit, finish_implementation

### 7. Deployer

- **文件路径：** `agents/deployer/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **用途：** 负责自动合并 PR、CI 检查、触发部署、健康检查等 DevOps 流程
- **工具：** merge_pr, check_ci, trigger_deploy, check_health, finish_deploy

### 8. Decision Maker

- **文件路径：** `agents/decision-maker/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **用途：** 从多个来源收集高价值信息，生成带置信度评分的结构化决策，支持信号聚合
- **工具：** spawn_agent, list_agents, web_search, search_vision_knowledge, search_decisions, finish_decision

### 9. Architect

- **文件路径：** `agents/architect/index.ts`
- **注册位置：** `lib/config/builtin-agents.ts`
- **用途：** 系统的"大脑"，自适应执行引擎，可动态创建新 Agent/Skill，编排其他 Agent 协作完成复杂任务
- **工具：** spawn_agent, list_agents, create_agent, create_skill, persist_agent, validate_output, discover_skills, web_search, list_files, read_file, finish_architect, blackboard_read, blackboard_write

### 10. Lead Miner（动态）

- **文件路径：** `agents/lead-miner/`（仅 soul.md）
- **注册位置：** `agents/dynamic-registry.json`
- **创建者：** Architect
- **用途：** 根据产品关键词搜索潜在客户和商业机会
- **工具：** web_search
- **退出工具：** finish_lead_mining

### 11. Email Composer（动态）

- **文件路径：** `agents/email-composer/`（仅 soul.md）
- **注册位置：** `agents/dynamic-registry.json`
- **创建者：** Architect
- **用途：** 根据潜在客户信息生成个性化触达邮件
- **技能：** compose-email, refine-email

---

## 架构设计

### 注册机制

Agent 注册分为三层：

1. **元数据注册**（`lib/config/builtin-agents.ts`）— 存储所有内置 Agent 的配置信息（ID、名称、角色、工具、技能等）
2. **工厂注册**（`lib/config/agent-registry.ts`）— 存储工厂函数，运行时实例化 Agent
3. **动态注册**（`agents/dynamic-registry.json`）— AI 生成的 Agent 按需懒加载

### 复杂度分级路由

用户请求通过 Chat Judge 进行复杂度评估，分为三个级别。核心判定规则：

- **L1 vs L2**：是否有具体产出物（代码、文件、文档）
- **L2 vs L3**：两个独立升级维度，任一满足即升级到 L3：
  - **维度1 — 系统范围**：涉及 2 个及以上独立模块或外部系统集成 → L3（即使是 POC/demo）
  - **维度2 — 工程质量**：明确要求生产级质量 → L3

#### L1 — 直接问答（direct）

```
执行者: ChatAssistant（maxLoops=3）
工具:   web_search, read_file, list_files（只读）
项目:   不创建
产出:   纯文本回复
人工审核: 无
```

- 由 `handleDirect` 处理
- 典型场景：纯问答、信息查询、概念解释

#### L2 — 轻量项目任务（single_agent）

```
执行者: ChatAssistant project 模式（maxLoops=10）
工具:   web_search, read_file, list_files + spawn_sub_agent + list_agents
项目:   light project（is_light: true，仅 DB 记录，无磁盘 workspace）
产出:   聊天文本（含 markdown 代码块 + 使用说明）
人工审核: 无
```

- 由 `handleSingleAgentWithProject` 处理
- 子 Agent 预算：最多 3 次 spawn，15 个 sub-agent loops
- **代码生成方式**：代码以 markdown 代码块形式输出在聊天消息中，不写入磁盘文件。回复末尾会自动附带「使用说明」（文件结构、环境准备、运行方式、预期效果），帮助用户将代码跑起来
- **关键限制**：没有 `code_write`/`code_edit` 工具，不会在磁盘上创建文件，用户需手动保存代码
- 典型场景：单模块 demo、单文件脚本、前端页面、文档生成、分析报告

#### L3 — 完整项目交付（agent_team）

```
执行者: 多阶段流水线（DM → Architect → Developer/Reviewer/Deployer）
项目:   full project（is_light: false）+ workspace（.workspaces/{id}/）
产出:   实际代码文件 + Git 提交 + PR + 可预览/部署
人工审核: DM 决策审批 + 工具执行审批（collaborative 模式）
```

- 执行流程：

```
用户输入 → Chat Judge 评估为 L3
  ↓
PlanPanel 展示 → 用户批准计划
  ↓
项目创建（createProject, is_light: false）
  ↓
[可选] 需求澄清（最多 3 轮）→ 用户确认需求
  ↓
Decision Maker 阶段 → 生成结构化决策（PROCEED/HALT）
  ↓
DMDecisionPanel → 用户审批 DM 决策
  ↓
Architect 阶段（maxLoops=50）
  ├── spawn Developer → code_write / code_edit / git_commit（在 workspace 中）
  ├── spawn Reviewer → 代码审查 / 测试验证
  ├── spawn Deployer → git_create_pr / trigger_deploy
  ├── 工具审批（collaborative 模式下每个危险工具需人工确认）
  ├── 断点持久化（每 3 步或 30s 写一次 checkpoint）
  └── 失败可恢复（ArchitectResumePanel，最多 3 次重试）
  ↓
产出：workspace 中的代码文件 + Git PR + 可预览部署
```

- **Blackboard**：跨阶段状态共享（DM 决策 → Architect → Developer 均可读写）
- **信任度设置**：Auto 模式下 Architect 阶段工具审批跳过，规划/设计阶段审核不变

#### 三级对比总结

| 特性 | L1 Direct | L2 Single Agent | L3 Agent Team |
|------|-----------|-----------------|---------------|
| 项目创建 | 无 | light project（DB） | full project + workspace（磁盘） |
| 代码生成 | 否 | 聊天文本输出（代码块 + 使用说明） | 磁盘文件（`.workspaces/{id}/`） |
| code_write/code_edit | 无 | 无 | Developer agent 持有 |
| Git 提交 / PR | 无 | 无 | 有 |
| 可预览/部署 | 否 | 否 | 是 |
| Agent 委派 | 无 | spawn_sub_agent（≤3） | spawn_agent（无限制） |
| 动态创建 Agent | 否 | 否 | 是（Architect 可创建） |
| 人工审核节点 | 无 | 无 | DM 审批 + 工具审批 |
| 断点恢复 | 无 | 无 | 有（checkpoint） |
| 状态共享 | 消息记录 | 消息记录 | Blackboard + Checkpoint |
| 最大循环 | 3 | 10 | 50+（Architect） |

### Sprint 13 整合历史

从 16 个 Agent 精简为 8 个核心 Agent：

- **Planner** 合并了：PM + Tech Lead + Orchestrator
- **Analyst** 合并了：Researcher + Blue Team + Critic + Arbitrator + Knowledge Curator
- **Reviewer** 合并了：QA Engineer + Code Reviewer + Supervisor
- **Chat Assistant** 新增：L1 直接对话处理
- **Chat Judge** 重命名：原 complexity-assessor

### System Prompt 加载机制

Agent 的 system prompt 分为**静态注册**和**动态生成**两种模式：

#### 数据流

```
builtin-agents.ts (defaultPrompt)          前端 Settings 展示
         │                                       ▲
         ▼                                       │
agent-config.ts  ──── getAgentRegistry() ────────┘
         │              │
         │         resolveDynamicDefaultPrompt()
         │              │
         ▼              ▼
agents/xxx/index.ts (工厂函数)
    ├── loadAgentConfig() → override.systemPrompt（用户覆盖，优先级最高）
    ├── getXxxPrompt(envContext)（动态生成，注入环境上下文）
    ├── loadSoul() → soul.md（Agent 人格/哲学）
    └── mergeSoulWithPrompt() → 最终 systemPrompt
```

#### 各 Agent 的 Prompt 来源

| Agent | `defaultPrompt` | 实际 Prompt 来源 | 类型 |
|-------|-----------------|-----------------|------|
| `planner` | `''`（空） | `getPlannerPrompt(mode)` — 按 mode 切换 3 套 prompt | 动态（mode-based） |
| `analyst` | `''`（空） | `getAnalystPrompt(mode)` — 按 mode 切换 5 套 prompt | 动态（mode-based） |
| `reviewer` | `''`（空） | `getReviewerPrompt(mode)` — 按 mode 切换 3 套 prompt | 动态（mode-based） |
| `chat-assistant` | `''`（空） | `getChatAssistantPrompt(envContext)` / `getChatAssistantProjectPrompt(envContext)` | 动态（env + mode） |
| `chat-judge` | `''`（空） | 工厂函数内部生成（内部 Agent，前端不展示） | 内部 |
| `developer` | `''`（空） | `DEVELOPER_PROMPT` 静态常量 | 静态 |
| `deployer` | `''`（空） | `DEPLOYER_PROMPT` 静态常量 | 静态 |
| `decision-maker` | `DECISION_MAKER_PROMPT` | 同 defaultPrompt | 静态（已注册） |
| `architect` | `ARCHITECT_PROMPT` | 同 defaultPrompt | 静态（已注册） |

#### 已知问题与修复状态

- **问题**：多数 Agent 在 `builtin-agents.ts` 中 `defaultPrompt: ''`，前端 Settings 无法展示实际 prompt
- **原因**：实际 prompt 由各 Agent 的工厂函数在运行时动态生成，但 `getAgentRegistry()` 返回的是注册时的空字符串
- **已修复**：全部 — 在 `getAgentRegistry()` 中通过 `resolveDynamicDefaultPrompt()` 统一解析，mode-based Agent 展示默认 mode 的 prompt（planner → `task-plan`，analyst → `research`，reviewer → `qa`），静态 Agent 直接返回常量

### 关键配置文件

| 文件 | 作用 |
|------|------|
| `lib/config/builtin-agents.ts` | 内置 Agent 元数据注册 |
| `lib/config/agent-registry.ts` | Agent 工厂注册 |
| `lib/config/dynamic-agents.ts` | 动态 Agent 加载器 |
| `agents/dynamic-registry.json` | 动态 Agent 注册表 |
| `agents/config.json` | Agent 配置覆盖 |
| `app/api/settings/agents/route.ts` | Agent 管理 API |
| `app/api/settings/agents/skills/route.ts` | Agent 技能 API |
