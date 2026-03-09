# Agent 合并分析报告

> 分析时间：2026-03-09
> Sprint 13 预研

---

## 一、当前 Agent 全景（20 个功能性 Agent）

### 按使用场景分组

| 场景 | Agent | 调用方 | 特点 |
|------|-------|--------|------|
| **Meta 层（核心编排）** | `architect` | meta-pipeline | 50 loops, spawn 子 agent, Blackboard, 审批门控 |
| | `decision-maker` | meta-pipeline | 15 loops, spawn 子 agent, 战略决策 |
| | `supervisor` | architect spawn | 5 loops, validate_output, 质量守门人 |
| **Prepare 层（信号评估）** | `knowledge-curator` | prepare-pipeline | 8 loops, RAG 多跳检索 |
| | `researcher` | prepare-pipeline | 5 loops, web_search |
| | `blue-team` | prepare-pipeline | 1 loop, single-shot, STAR 论证 |
| | `critic` | prepare-pipeline | 10 loops, web_search, 对抗审查 |
| | `arbitrator` | prepare-pipeline | 1 loop, single-shot, 最终裁决 |
| **Planning 层** | `pm` | plan-pipeline | 1 loop, single-shot, PRD 生成 |
| | `tech-lead` | plan-pipeline | 15 loops, read_file/list_files |
| | `orchestrator` | implement-pipeline | 25 loops, 生成 implementation DAG |
| **Implement 层** | `developer` | implement-pipeline | 20 loops, workspace tools, 代码生成 |
| | `qa-engineer` | implement-pipeline | 10 loops, workspace tools, 测试验证 |
| | `code-reviewer` | implement-pipeline | 10 loops, workspace tools, 代码审查 |
| **Deploy 层** | `deployer` | implement-pipeline | 15 loops, merge_pr/trigger_deploy |
| **Utility** | `complexity-assessor` | chat-engine | 不可 spawn, 复杂度评估（LLM 调用） |
| **Dynamic/Business** | `email-composer` | dynamic-registry | 1 loop, 邮件生成 |
| | `lead-miner` | dynamic-registry | 8 loops, lead 挖掘 |

---

## 二、每个 Agent 的详细分析

### 2.1 architect（保留）

- **文件**: `agents/architect/index.ts`
- **工厂函数**: `createArchitectAgent(options?)`
- **Options**: `{ model?, context?, workspace?, extraTools?, onApprovalRequired?, blackboard?, initialMessages? }`
- **Exit Tool**: `finish_architect`
- **Max Loops**: 50
- **工具集**: SpawnAgentTool, ListAgentsTool, CreateAgentTool, CreateSkillTool, PersistAgentTool, PersistSkillTool, PromoteFeatureTool, ValidateOutputTool, DiscoverSkillsTool, FinishArchitectTool, web_search, list_files, read_file, BlackboardReadTool(optional), BlackboardWriteTool(optional)
- **Soul**: 自适应执行引擎，最小化浪费，动态能力扩展
- **不可替代理由**: 核心编排引擎，唯一具备 spawn/create/persist agent 能力

### 2.2 decision-maker（保留）

- **文件**: `agents/decision-maker/index.ts`
- **工厂函数**: `createDecisionMakerAgent(options?)`
- **Options**: `{ model?, context?, blackboard? }`
- **Exit Tool**: `finish_decision`
- **Max Loops**: 15
- **工具集**: SpawnAgentTool, ListAgentsTool, FinishDecisionTool, web_search, search_vision_knowledge, search_decisions, BlackboardReadTool(optional), BlackboardWriteTool(optional)
- **Soul**: 证据优先，多维视角，置信度校准，信号聚合
- **不可替代理由**: 战略决策入口，具备 spawn 能力，Blackboard 集成

### 2.3 developer（保留）

- **文件**: `agents/developer/index.ts`
- **工厂函数**: `createDeveloperAgent(options)` [REQUIRED options]
- **Options**: `{ model?, specialization?, taskDescription?, context?, tools[], skills?, maxLoops?, initialMessages? }`
- **Exit Tool**: `finish_implementation`
- **Max Loops**: 20
- **工具集**: 由调用方注入（workspace-scoped）
- **Soul**: YAGNI, test-first, minimal changes, respect existing code
- **特殊能力**: Skill 注入支持, prompt template resolution
- **不可替代理由**: 代码生成核心，workspace-scoped tools 注入模式独特

### 2.4 deployer（保留）

- **文件**: `agents/deployer/index.ts`
- **工厂函数**: `createDeployerAgent(options)` [REQUIRED options]
- **Options**: `{ model?, taskDescription?, context?, tools[] }`
- **Exit Tool**: `finish_deploy`
- **Max Loops**: 15
- **工具集**: 由调用方注入（deploy-specific：merge_pr, check_ci, trigger_deploy, check_health, finish_deploy）
- **Soul**: Safety-first, observable, fast rollback, clear logging
- **不可替代理由**: 部署工具集独特

### 2.5 pm（→ 合并到 planner）

- **文件**: `agents/pm/index.ts`
- **工厂函数**: `createPMAgent(options?)`
- **Options**: `{ model? }`
- **Max Loops**: 1（single-shot, 无 exit tool）
- **Model Override**: gpt-4o-mini
- **工具集**: 无
- **Soul**: User-first, vision alignment, simplicity, data-driven
- **合并理由**: 单次 LLM 调用生成 PRD，职能上是"需求→计划"的第一步

### 2.6 tech-lead（→ 合并到 planner）

- **文件**: `agents/tech-lead/index.ts`
- **工厂函数**: `createTechLeadAgent(options?)`
- **Options**: `{ model? }`
- **Exit Tool**: `finish_planning`
- **Max Loops**: 15
- **工具集**: list_files, read_file, finish_planning
- **Soul**: Code-as-truth, progressive implementation, dependency ordering
- **合并理由**: 将 PRD 转化为开发任务，与 orchestrator 共用 `finish_planning` exit tool

### 2.7 orchestrator（→ 合并到 planner）

- **文件**: `agents/orchestrator/index.ts`
- **工厂函数**: `createOrchestratorAgent(options?)`
- **Options**: `{ model?, context?, extraTools? }`
- **Exit Tool**: `finish_planning`
- **Max Loops**: 25
- **工具集**: web_search, list_files, read_file, finish_planning + optional extra tools
- **Soul**: Divide-and-conquer, minimal privilege, explicit dependencies, fault tolerance
- **合并理由**: 生成 implementation DAG，与 tech-lead 职能递进

### 2.8 researcher（→ 合并到 analyst）

- **文件**: `agents/researcher/index.ts`
- **工厂函数**: `createResearcherAgent(options?)`
- **Options**: `{ model? }`
- **Max Loops**: 5
- **Model Override**: gpt-4o-mini
- **工具集**: web_search
- **Soul**: Facts first, efficiency-focused, structured presentation
- **合并理由**: prepare-pipeline 的第一步，负责市场调研

### 2.9 blue-team（→ 合并到 analyst）

- **文件**: `agents/blue-team/index.ts`
- **工厂函数**: `createBlueTeamAgent(options?)`
- **Options**: `{ model? }`
- **Max Loops**: 1（single-shot）
- **Model Override**: gpt-4o-mini
- **工具集**: 无
- **Soul**: Data-driven, investor mindset, ROI-oriented, STAR framework
- **合并理由**: prepare-pipeline 中的"辩护方"，用 STAR 框架论证

### 2.10 critic（→ 合并到 analyst）

- **文件**: `agents/critic/index.ts`
- **工厂函数**: `createCriticAgent(options?)`
- **Options**: `{ model?, client?, poolTags?, accountId?, accountName? }`
- **Max Loops**: 10
- **Model Override**: gpt-4o-mini
- **工具集**: web_search（用于事实验证）
- **Soul**: Question everything, evidence-based, 3-dimensional review, fair but strict
- **特殊能力**: 支持 red-team LLM 客户端透传（独立 model/account）
- **合并理由**: prepare-pipeline 中的"批判方"

### 2.11 arbitrator（→ 合并到 analyst）

- **文件**: `agents/arbitrator/index.ts`
- **工厂函数**: `createArbitratorAgent(options?)`
- **Options**: `{ model? }`
- **Max Loops**: 1（single-shot）
- **Model Override**: gpt-4o-mini
- **工具集**: 无
- **Soul**: Neutral independence, evidence-based, transparent reasoning
- **合并理由**: prepare-pipeline 最终裁决，简单的单次调用

### 2.12 knowledge-curator（→ 合并到 analyst）

- **文件**: `agents/knowledge-curator/index.ts`
- **工厂函数**: `createKnowledgeCuratorAgent(options?)`
- **Options**: `{ model? }`
- **Exit Tool**: `finish_retrieval`
- **Max Loops**: 8
- **Model Override**: gpt-4o-mini
- **工具集**: SearchVisionKnowledgeTool, SearchDecisionsTool, SearchCodeArtifactsTool, SearchCodePatternsTool, FinishRetrievalTool
- **Soul**: Context is power, coverage > precision, structured output
- **合并理由**: prepare-pipeline 的上下文检索步骤

### 2.13 qa-engineer（→ 合并到 reviewer）

- **文件**: `agents/qa/index.ts`（注册 ID: `qa-engineer`）
- **工厂函数**: `createQAAgent(options)` [REQUIRED options]
- **Options**: `{ model?, taskDescription?, context?, tools[], maxLoops?, initialMessages? }`
- **Exit Tool**: `finish_implementation`
- **Max Loops**: 10
- **工具集**: 由调用方注入
- **Soul**: Suspect all code, user-perspective testing, regressions priority-1
- **合并理由**: 与 code-reviewer 共用 exit tool，职能均为"验证/审查"

### 2.14 code-reviewer（→ 合并到 reviewer）

- **文件**: `agents/reviewer/index.ts`（注册 ID: `code-reviewer`）
- **工厂函数**: `createReviewerAgent(options)` [REQUIRED options]
- **Options**: `{ model?, taskDescription?, context?, tools[], maxLoops?, initialMessages? }`
- **Exit Tool**: `finish_implementation`
- **Max Loops**: 10
- **工具集**: 由调用方注入
- **Soul**: Review decisions not just code, constructive > critical, blocker vs nit
- **合并理由**: 与 qa-engineer 共用 exit tool，职能均为"验证/审查"

### 2.15 supervisor（→ 合并到 reviewer）

- **文件**: `agents/supervisor/index.ts`
- **工厂函数**: `createSupervisorAgent(options?)`
- **Options**: `{ model?, context? }`
- **Max Loops**: 5
- **工具集**: validate_output, read_file, list_files
- **Soul**: Trust but verify, context-aware validation, constructive feedback
- **合并理由**: 质量验证职能，由 architect spawn 调用

### 2.16 complexity-assessor（→ 重命名为 chat-judge）

- **文件**: `agents/complexity-assessor/index.ts`
- **工厂函数**: `createComplexityAssessorAgent(options?)`
- **导出**: `assessComplexity(userMessage, conversationHistory?, context?)`
- **Max Loops**: 1（single-shot）
- **Model**: gpt-4o
- **工具集**: 无
- **输出**: ComplexityAssessment（L1/L2/L3 + execution_mode + rationale 等）
- **当前问题**: 未注册到 spawn 注册表，前端不可见，用户无感知
- **改造**: 重命名为 `chat-judge`，注册到注册表，添加 UI badge

### 2.17-2.18 email-composer / lead-miner（本次不动）

- Dynamic agents，在 `agents/dynamic-registry.json` 中注册
- 业务专用（销售流程），不影响核心 pipeline
- 本次跳过

---

## 三、Agent 引用关系全图

### Pipeline 调用链

```
Meta Pipeline (meta-pipeline.ts):
  decision-maker → architect

Prepare Pipeline (prepare-pipeline.ts):
  knowledge-curator → researcher → blue-team → critic → arbitrator

Implement Pipeline (implement-pipeline.ts):
  orchestrator → developer/qa-engineer/code-reviewer → (optional) deployer

Plan Pipeline (plan-pipeline.ts):
  pm → tech-lead

ChatEngine 入口:
  complexity-assessor → 路由到 L1/L2/L3
```

### 注册文件

| 文件 | 职能 |
|------|------|
| `lib/config/builtin-agents.ts` | 注册 15 个 built-in agent 元数据 |
| `lib/config/agent-ui-meta.ts` | 前端 UI 样式（label/emoji/color/stage） |
| `lib/config/agent-config.ts` | agent 配置加载（model override） |
| `lib/tools/list-agents.ts` | AGENT_CATEGORIES 映射 |
| `lib/tools/spawn-agent.ts` | spawn 注册表（registerAgentFactory） |
| `agents/config.json` | 6 个 agent 的 model override（gpt-4o-mini） |

### 前端组件引用

以下组件通过 `getAgentUI(id)` 引用 agent ID，会自动适配新 ID：
- `components/agents/AgentStepCard.tsx`
- `components/agents/AgentProgressBar.tsx`
- `components/chat/ChatView.tsx`
- `components/chat/ArchitectResumePanel.tsx`
- `components/traces/TraceDetailView.tsx`
- `components/traces/TraceCard.tsx`
- `components/traces/TraceEventCard.tsx`
- `components/settings/AgentConfigCard.tsx`
- `components/settings/UsageSnapshotCard.tsx`

---

## 四、合并方案：20 → 8 个核心 Agent

### 最终 Agent 清单

| # | Agent ID | 来源 | 职能 | 工具数 |
|---|----------|------|------|--------|
| 1 | `architect` | 保留 | 动态执行引擎，spawn 子 agent，Blackboard，审批门控 | 12+ |
| 2 | `decision-maker` | 保留 | 战略决策入口，信息聚合，spawn 能力 | 6+ |
| 3 | `developer` | 保留 | 代码生成，workspace-scoped tools 注入 | 注入 |
| 4 | `deployer` | 保留 | 部署工具链 | 5 |
| 5 | `planner` | 合并 pm + tech-lead + orchestrator | 需求→PRD→任务拆解→implementation DAG | 5 |
| 6 | `analyst` | 合并 researcher + blue-team + critic + arbitrator + knowledge-curator | 信号评估全链路，通过 mode 参数切换 | 6 |
| 7 | `reviewer` | 合并 qa-engineer + code-reviewer + supervisor | 质量门控全链路，通过 mode 参数切换 | 注入 + validate_output |
| 8 | `chat-judge` | 原 complexity-assessor 重命名 + 注册 | 用户需求复杂度评估（L1/L2/L3） | 0 |

### 合并设计详情

#### planner（pm + tech-lead + orchestrator）

- **mode 参数**:
  - `prd`: 原 pm（single-shot, maxLoops 1，无工具）
  - `task-plan`: 原 tech-lead（ReAct, maxLoops 15, tools: list_files/read_file/finish_planning）
  - `implementation-dag`（默认）: 原 orchestrator（ReAct, maxLoops 25, tools: web_search/list_files/read_file/finish_planning/discover_skills）
- **统一 exit tool**: `finish_planning`
- **调用方影响**: implement-pipeline.ts、plan-pipeline.ts

#### analyst（researcher + blue-team + critic + arbitrator + knowledge-curator）

- **mode 参数**:
  - `research`: 原 researcher（ReAct, maxLoops 5, tools: web_search）
  - `advocate`: 原 blue-team（single-shot, maxLoops 1，无工具）
  - `critique`: 原 critic（ReAct, maxLoops 10, tools: web_search）。透传 client/poolTags/accountId/accountName（red-team LLM）
  - `arbitrate`: 原 arbitrator（single-shot, maxLoops 1，无工具）
  - `retrieve`: 原 knowledge-curator（ReAct, maxLoops 8, tools: RAG 检索工具集 + finish_retrieval）
- **prepare-pipeline 结构**: 保持 5 步不变，只替换工厂调用
- **调用方影响**: prepare-pipeline.ts

#### reviewer（qa-engineer + code-reviewer + supervisor）

- **mode 参数**:
  - `qa`: 原 qa-engineer（ReAct, maxLoops 10, tools 注入, exit: finish_implementation）
  - `review`（默认）: 原 code-reviewer（ReAct, maxLoops 10, tools 注入, exit: finish_implementation）
  - `supervise`: 原 supervisor（ReAct, maxLoops 5, tools: validate_output/read_file/list_files）
- **调用方影响**: implement-pipeline.ts（agentTemplate 别名映射）、architect spawn

#### chat-judge（重命名 + 注册）

- 原 `complexity-assessor` 迁移到 `agents/chat-judge/`
- 新增 `registerAgentFactory('chat-judge', createChatJudgeAgent)`
- 添加 UI meta，前端可见

---

## 五、向后兼容方案

### AGENT_ALIASES（agent-ui-meta.ts）

```typescript
// 旧 agent name → 新 agent name
pm: 'planner',
tech_lead: 'planner',
orchestrator: 'planner',
researcher: 'analyst',
blue_team: 'analyst',
critic: 'analyst',
arbitrator: 'analyst',
knowledge_curator: 'analyst',
qa_engineer: 'reviewer',
code_reviewer: 'reviewer',
supervisor: 'reviewer',
complexity_assessor: 'chat-judge',
```

### implement-pipeline agentTemplate 映射

DB 中已存的旧 plan 使用 `'qa-engineer'`、`'code-reviewer'` 作为 agentTemplate 字符串。implement-pipeline 内部增加别名映射：

```typescript
const TEMPLATE_ALIASES: Record<string, { agent: string; mode: string }> = {
  'qa-engineer': { agent: 'reviewer', mode: 'qa' },
  'code-reviewer': { agent: 'reviewer', mode: 'review' },
  'orchestrator': { agent: 'planner', mode: 'implementation-dag' },
};
```

---

## 六、参考项目分析：agency-agents

> 来源：https://github.com/msitarzewski/agency-agents

### Prompt 工程最佳实践

#### 1. Identity-First 结构

不用"Act as a developer"，而是：
```markdown
You are **EvidenceQA**, a skeptical QA specialist who requires visual
proof for everything. You have persistent memory and HATE fantasy reporting.

## Identity & Memory
- **Role**: Quality assurance specialist
- **Personality**: Skeptical, detail-oriented, evidence-obsessed
- **Memory**: You remember previous test failures and patterns
```

**为什么有效**: 创建独特人格 + 价值观，让约束感觉像性格特征而非限制。

#### 2. Mission-Based 架构

任务不是 tasks，是 aspirational objectives：
```markdown
### Design Scalable System Architecture
- Create microservices architectures that scale horizontally
- **Default requirement**: Include comprehensive security in all systems
```

**为什么有效**: `**Default requirement**` 模式嵌入非可选标准。

#### 3. Critical Rules as Doctrine

不是可选建议，是不可协商的操作原则：
```markdown
### "Screenshots Don't Lie"
- Visual evidence is the only truth that matters
- Claims without evidence are fantasy
```

#### 4. 具体 Deliverable Templates

不描述怎么想，而是展示精确模板：
```markdown
### System Architecture Design
```markdown
# System Architecture Specification
## High-Level Architecture
**Architecture Pattern**: [Microservices/Monolith/Serverless/Hybrid]
```

#### 5. 量化 Success Metrics

不用 "good performance"，而是：
```markdown
- API response times consistently stay under 200ms for P95
- System uptime exceeds 99.9%
- Database queries perform under 100ms average
```

#### 6. Memory & Learning

每个 agent 包含学习层：
```markdown
## Learning & Memory
Remember and build expertise in:
- Architecture patterns that solve scalability challenges
- Performance optimizations that reduce costs
```

#### 7. NEXUS 编排协议

Phase-based pipeline + Quality gates + Dev↔QA loop + 结构化 Handoff 文档。

### 建议采纳的模式

| 模式 | 当前 RebuilD | 建议改进 |
|------|-------------|---------|
| Identity-First | soul.md 有简单角色描述 | 升级为完整人格+记忆+经验描述 |
| Mission-Based | prompt 中有任务描述 | 改为 aspirational objectives + Default requirement |
| Critical Rules | 散落在 prompt 各处 | 集中为 Doctrine 章节 |
| Deliverable Templates | 仅 exit tool schema 定义输出 | 增加 markdown 模板示例 |
| Success Metrics | 无 | 新增量化指标章节 |
| Memory Layer | 无 | 新增 Learning & Memory 章节 |

---

## 七、高级设置需求

### 三种执行模式

| 模式 | 名称 | 行为 | 状态 |
|------|------|------|------|
| 简单 | Workflow | 固定 8 个核心 agent，线性执行 | 默认 |
| 中等 | Agent Teams | decision-maker 派发任务后，每个工作节点可生成项目专属 agent，项目结束后用户可保留/删除 | 可选 |
| 高级 | Agent Swarm | 待设计 | 灰色禁用，标注"即将推出" |

### 模式切换警告

切换到中等模式时弹出确认弹窗：
- 此模式下每个工作节点会生成具备独立技能的 agent
- 会带来更高的 token 消耗
- 反馈结果更加详实
- 需要用户 double check 确认

### 项目专属 Agent 管理

中等模式下动态创建的 agent：
- 关联 projectId
- 项目结束后推送通知
- 在 Settings → Agents 中可见
- 支持"保留"/"删除"操作

---

## 八、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| analyst 合并后对抗性减弱 | blue-team/critic 同一 agent 既辩护又批判 | 通过 mode 参数加载完全不同的 prompt，保持对立角色 |
| agentTemplate 字符串兼容 | DB 中已存旧 plan 无法 resume | TEMPLATE_ALIASES 别名映射 + AGENT_ALIASES UI 映射 |
| Architect prompt 中 spawn 引用 | soul.md/prompt 中写了旧 agent name | 统一更新所有 spawn 示例为新 name |
| 改动量大（~55 文件） | 单次提交风险高 | 分 4 个子 commit 递增执行 |

---

## 九、影响范围估算

| 类别 | 文件数 | 复杂度 |
|------|--------|--------|
| 新建 Agent（planner/analyst/reviewer/chat-judge） | ~12 | 高 |
| Pipeline 调用方更新 | ~4 | 中 |
| 注册 & 元数据 | ~4 | 低 |
| Prompt 增强（8 agent） | ~10 | 中 |
| 高级设置 UI + API | ~7 | 中 |
| 中等模式（动态 agent 可见性） | ~2 | 低 |
| 测试 | ~2 | 低 |
| 删除旧文件 | ~18 | 低 |
| **总计** | **~55 文件** | **高** |
