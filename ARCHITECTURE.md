# RebuilD System Architecture

> AI-Native Project Management System — Complete Architecture Reference

---

## 1. System Overview

```
                            RebuilD Architecture
 ============================================================================

  External Signals                              Manual Input
  (YouTube/Reddit/Twitter)                      (User via UI)
         |                                           |
         v                                           v
  +------------------+                    +--------------------+
  | Sensing / Cron   |                    | Dashboard UI       |
  | collect-signals  |                    | (Next.js App)      |
  +--------+---------+                    +---------+----------+
           |                                        |
           |   signals table (DRAFT)                |
           +--------------------+-------------------+
                                |
                    POST /api/meta  (SSE Stream)
                                |
                                v
            +===========================================+
            |         META-AGENT LAYER (New)            |
            |                                           |
            |   +-------------+    +--------------+     |
            |   | Decision    |--->| Architect    |     |
            |   | Maker (DM)  |    | (AC)         |     |
            |   | ReAct x15   |    | ReAct x30    |     |
            |   +------+------+    +------+-------+     |
            |          |                  |             |
            |          |     +-----------+----------+   |
            |          |     |                      |   |
            |          v     v                      v   |
            |   +--------------+            +-----------+ |
            |   | spawn_agent  |            | Supervisor| |
            |   | create_agent |            | (SV)      | |
            |   | create_skill |            | ReAct x5  | |
            |   +--------------+            +-----------+ |
            +===========================================+
                                |
              +-----------------+------------------+
              |                 |                   |
              v                 v                   v
   +----------+---+  +---------+----+  +-----------+--+
   | Evaluation   |  | Planning     |  | Implementation|
   | Agents       |  | Agents       |  | Agents        |
   +----------+---+  +---------+----+  +-----------+--+
              |                 |                   |
              v                 v                   v
        +-----------+   +-----------+   +------------+
        | RAG /     |   | PRD /     |   | Code /     |
        | Knowledge |   | Tasks     |   | Deploy     |
        +-----------+   +-----------+   +------------+
              |                 |                   |
              +--------+--------+-------------------+
                       |
                       v
              +------------------+
              | Supabase         |
              | (PostgreSQL +    |
              |  pgvector)       |
              +------------------+
```

---

## 2. Meta-Agent Governance Model

```
  +============================================================+
  |                    META-AGENT TRIO                          |
  |                                                            |
  |  +-----------------+                                       |
  |  | Decision Maker  |  "What should we do?"                 |
  |  | (DM)            |                                       |
  |  |                 |  - Aggregates batch signals            |
  |  |  ReAct x15      |  - Spawns analysis agents             |
  |  |  Tools:         |  - Outputs: DecisionOutput            |
  |  |   spawn_agent   |  - Confidence >= 0.7 to PROCEED       |
  |  |   list_agents   |                                       |
  |  |   web_search    |                                       |
  |  |   search_*      |                                       |
  |  |   finish_dec.   |                                       |
  |  +--------+--------+                                       |
  |           | PROCEED                                        |
  |           v                                                |
  |  +-----------------+        +-----------------+            |
  |  | Architect       |<------>| Supervisor      |            |
  |  | (AC)            |validate| (SV)            |            |
  |  |                 |------->|                 |            |
  |  |  ReAct x30      |        |  ReAct x5       |            |
  |  |  "How to do it" |        |  "Is it right?" |            |
  |  |                 |        |                 |            |
  |  |  Tools:         |        |  Tools:         |            |
  |  |   spawn_agent   |        |   validate_out  |            |
  |  |   create_agent  |        |   read_file     |            |
  |  |   create_skill  |        |   list_files    |            |
  |  |   persist_agent |        |                 |            |
  |  |   list_agents   |        |  Output:        |            |
  |  |   discover_sk.  |        |   pass/warn/    |            |
  |  |   validate_out  |        |   fail          |            |
  |  |   finish_arch.  |        +-----------------+            |
  |  +--------+--------+                                       |
  |           |                                                |
  |           v                                                |
  |  ArchitectResult { execution_trace, created_agents, ... }  |
  +============================================================+
```

---

## 3. Agent Inventory (15 Agents)

```
  Stage: META (New)
  +-----------------------------------------------------------------+
  |  decision-maker   |   architect        |   supervisor           |
  |  Evidence-based   |   Adaptive exec    |   Quality gate         |
  |  decisions        |   engine           |   validation           |
  |  ReAct x15        |   ReAct x30        |   ReAct x5             |
  +-----------------------------------------------------------------+

  Stage: PREPARE (Evaluation)
  +-----------------------------------------------------------------+
  |  researcher   | blue-team  | critic     | arbitrator | kn-curator|
  |  Market scan  | STAR case  | Red team   | Final      | RAG multi |
  |  ReAct x5     | Shot x1    | ReAct x10  | Shot x1    | ReAct x8  |
  +-----------------------------------------------------------------+

  Stage: PLAN
  +-----------------------------------------------------------------+
  |  pm (Product Manager)   | tech-lead          | orchestrator     |
  |  Signal -> PRD          | PRD -> Tasks       | Req -> DAG       |
  |  Single-shot            | ReAct x15          | ReAct x10        |
  +-----------------------------------------------------------------+

  Stage: IMPLEMENT + DEPLOY
  +-----------------------------------------------------------------+
  |  developer  | qa-engineer | code-reviewer | deployer            |
  |  Code gen   | Test/QA     | PR review     | CI/CD/Health        |
  |  ReAct x20  | ReAct x10   | ReAct x10     | ReAct x15           |
  +-----------------------------------------------------------------+
```

---

## 4. Tool Registry (34 Tools)

```
  CATEGORY           TOOL NAME                PURPOSE
  ===============    ====================     ============================
  Filesystem         list_files               List directory contents
                     read_file                Read file content
                     code_write               Create new file
                     code_edit                Edit existing file

  Git/VCS            git_commit               Commit code changes
                     git_create_pr            Create pull request

  Development        run_command              Execute shell command
                     run_tests                Run test suite
                     web_search               Search the web

  Deployment         merge_pr                 Merge pull request
                     check_ci                 Check CI status
                     trigger_deploy           Trigger deployment
                     check_health             HTTP health check

  RAG/Knowledge      search_vision_knowledge  Query vision docs
                     search_decisions         Query decision history
                     search_code_artifacts    Query code artifacts
                     search_code_patterns     Query code patterns
                     rag_retrieve             General RAG retrieval
                     store_code_pattern       Store code pattern
                     discover_skills          Semantic skill search

  Meta-Agent         spawn_agent              Invoke a sub-agent
                     list_agents              Introspect agent registry
                     create_agent             Dynamic agent creation
                     create_skill             Dynamic skill creation
                     persist_agent            Save agent to disk
                     validate_output          Programmatic validation

  Exit Signals       finish_planning          Exit planning loop
                     finish_implementation    Exit implementation loop
                     finish_deploy            Exit deploy loop
                     finish_retrieval         Exit retrieval loop
                     finish_decision          Exit decision loop
                     finish_architect         Exit architect loop
```

---

## 5. Data Flow: Meta Pipeline

```
  Input (Single or Batch)
  ========================

  User Requirement ----+
                       |
  Signal Batch --------+----> runMetaPipeline()
  (from cron)          |
                       v
          +---------------------------+
          |  Phase 1: Decision Maker  |
          |                           |
          |  1. Aggregate signals     |
          |     (group by topic)      |
          |  2. Build context         |
          |     (knowledge-curator)   |
          |  3. Collect evidence      |
          |     (researcher, etc.)    |
          |  4. Evaluate risk         |
          |  5. Output DecisionOutput |
          +-----------+---------------+
                      |
           +----------+----------+
           |                     |
     PROCEED (>=0.7)      HALT/DEFER/ESCALATE
           |                     |
           v                     v
  +------------------+     Return early
  | Phase 2:         |     (pipeline stops)
  | Architect        |
  |                  |
  | For each subtask:|
  |  1. list_agents  |
  |  2. spawn/create |-------> Sub-Agent
  |  3. execute      |<------- Result
  |  4. validate     |-------> Supervisor
  |  5. retry/next   |<------- pass/fail
  |                  |
  | Output:          |
  | ArchitectResult  |
  +--------+---------+
           |
           v
  +------------------+
  | Phase 3: Cleanup |
  | Remove temporary |
  | agents & skills  |
  +------------------+
           |
           v
  MetaPipelineResult {
    decision,
    architect,
    skippedDecision
  }
```

---

## 6. Data Flow: Traditional Pipeline (Existing)

```
  POST /api/analyze (stage=prepare)
           |
           v
  +---------------------------+
  | Prepare (Circuit Breaker) |
  |                           |
  |  RAG Context Retrieval    |
  |        |                  |
  |  Researcher (web search)  |
  |        |                  |
  |  Blue Team (STAR case)    |
  |        |                  |
  |  Critic (adversarial)     |
  |        |                  |
  |  Arbitrator (verdict)     |
  |        |                  |
  |  Decision: PROCEED / HALT |
  +-----------+---------------+
              |
              v  (if PROCEED + user approves)
  +---------------------------+
  | Plan                      |
  |                           |
  |  PM -> PRD (JSON)         |
  |        |                  |
  |  Tech Lead -> Tasks       |
  |    (explore codebase,     |
  |     decompose tasks)      |
  +-----------+---------------+
              |
              v
  +---------------------------+
  | Implement                 |
  |                           |
  |  Orchestrator -> DAG      |
  |        |                  |
  |  topoSort (dependencies)  |
  |        |                  |
  |  For each task:           |
  |    Developer -> code      |
  |    QA -> tests            |
  |    Reviewer -> review     |
  |    Git commit + PR        |
  +-----------+---------------+
              |
              v
  +---------------------------+
  | Deploy                    |
  |                           |
  |  check_ci -> merge_pr     |
  |  trigger_deploy           |
  |  check_health             |
  |  Report                   |
  +---------------------------+
```

---

## 7. Dynamic Agent/Skill Lifecycle

```
  Architect identifies capability gap
           |
           v
  +---------------------------+
  | list_agents / discover_sk |
  | "Is there a suitable one?"|
  +-----------+---------------+
              |
      +-------+-------+
      |               |
    Found         Not Found
      |               |
      v               v
  spawn_agent    create_agent / create_skill
                      |
                      v
               +-------------------+
               | DynamicDefinition |
               | stored in-memory  |
               | (Map)             |
               +--------+----------+
                        |
              +---------+---------+
              |                   |
         Session-only        persist_agent
         (auto-cleanup)           |
                                  v
                         +------------------+
                         | agents/{name}/   |
                         |   soul.md        |
                         |   index.ts       |
                         +------------------+
                         Survives restarts
```

---

## 8. Knowledge & RAG Architecture

```
  +==============================================================+
  |                    KNOWLEDGE LAYER                            |
  |                                                              |
  |  +-----------------+  +------------------+  +-------------+  |
  |  | Vision Docs     |  | Decision History |  | Code        |  |
  |  | (project goals, |  | (past verdicts,  |  | Artifacts   |  |
  |  |  product vision)|  |  rationales)     |  | (files, PRs)|  |
  |  +--------+--------+  +--------+---------+  +------+------+  |
  |           |                     |                   |         |
  |           v                     v                   v         |
  |  +------------------------------------------------------+    |
  |  |              pgvector (256-dim embeddings)            |    |
  |  |         text-embedding-3-small                        |    |
  |  +------------------------------------------------------+    |
  |           |                     |                   |         |
  |           v                     v                   v         |
  |  search_vision_    search_decisions    search_code_artifacts  |
  |  knowledge                                                   |
  |                                                              |
  |  Used by: Knowledge-Curator, Decision Maker, Architect       |
  +==============================================================+
```

---

## 9. Message Bus & Real-time Streaming

```
  Agent Execution
       |
       | messageBus.publish({ from, channel, type, payload })
       v
  +--------------------+
  | MessageBus         |
  | (EventEmitter)     |
  |                    |
  |  Channels:         |
  |   agent-log        |--- SSE ---> Frontend (AgentActivityFeed)
  |   decision-maker   |
  |   architect-log    |
  |   supervisor-log   |
  |   meta-pipeline    |
  +--------------------+

  Message Types:
    agent_start / agent_log / agent_tool / agent_complete
    stage_complete / pipeline_complete
    meta_decision / meta_spawn / meta_validate / meta_retry
    meta_create_agent / meta_create_skill
```

---

## 10. API Endpoints

```
  /api/meta                  POST   Meta pipeline (Decision Maker -> Architect)
  /api/analyze               POST   Traditional pipeline (Prepare / Plan)

  /api/projects              GET    List projects
  /api/projects              POST   Create project
  /api/projects/[id]/execute POST   Execute prepare/plan
  /api/projects/[id]/implement POST Run implementation
  /api/projects/[id]/deploy  POST   Run deployment

  /api/signals               GET    List signals
  /api/signals               POST   Update signal
  /api/signals/[id]/convert  POST   Signal -> Project
  /api/signals/sources       GET    List signal sources

  /api/cron/collect-signals  POST   Fetch from YouTube/Reddit/Twitter
  /api/cron/process-signals  POST   Batch process DRAFT signals

  /api/settings/agents       GET    Agent configurations
  /api/settings/preferences  POST   User preferences
```

---

## 11. Database Schema

```
  signals
  +-----------+-----------+------------------------------------------+
  | Column    | Type      | Description                              |
  +-----------+-----------+------------------------------------------+
  | id        | uuid      | Primary key                              |
  | source_url| text      | Origin URL or 'user-input-idea'          |
  | content   | text      | Raw signal content                       |
  | status    | text      | DRAFT / PROCESSING / ANALYZED / APPROVED |
  | embedding | vector    | 256-dim for similarity search            |
  | created_at| timestamp |                                          |
  +-----------+-----------+------------------------------------------+

  decisions
  +-----------+-----------+------------------------------------------+
  | signal_id | uuid      | FK to signals                            |
  | rationale | text      | Decision reasoning                       |
  | result    | text      | PROCEED / HALT / DEFER / ESCALATE        |
  | embedding | vector    | For consistency checking                 |
  +-----------+-----------+------------------------------------------+

  code_artifacts
  +-----------+-----------+------------------------------------------+
  | task_id   | text      | Associated task                          |
  | file_path | text      | Modified file path                       |
  | content   | text      | File content or diff                     |
  | type      | text      | file_created / file_modified / pr_created|
  | embedding | vector    | For code search                          |
  +-----------+-----------+------------------------------------------+

  projects
  +-----------+-----------+------------------------------------------+
  | project_id| uuid      | Primary key                              |
  | status    | text      | Pipeline status                          |
  | signal_id | uuid      | Source signal                            |
  | prepare_* | jsonb     | Prepare stage results                    |
  | plan_*    | jsonb     | Plan stage results                       |
  +-----------+-----------+------------------------------------------+
```

---

## 12. Frontend Architecture

```
  app/(dashboard)/
  +-- layout.tsx            DashboardShell wrapper
  +-- page.tsx              Main dashboard
  +-- projects/
  |   +-- page.tsx          Project list
  |   +-- [id]/page.tsx     Project detail
  +-- signals/
  |   +-- page.tsx          Signal management
  +-- kanban/
  |   +-- page.tsx          Kanban board
  +-- settings/
      +-- page.tsx          Settings

  components/
  +-- layout/
  |   +-- DashboardShell    Main layout
  |   +-- Sidebar           Navigation
  |   +-- RightPanel        Context panel
  |   +-- BottomInputBar    User input
  +-- agent/
  |   +-- AgentActivityFeed SSE log viewer
  |   +-- AgentProgressBar  Step progress
  |   +-- AgentStepCard     Step detail
  +-- project/
  |   +-- ProjectCard       Summary card
  |   +-- KanbanBoard       Task board
  +-- results/
      +-- PrepareResultCard Stage output
      +-- PlanResultCard
      +-- ImplementResultCard

  store/
  +-- usePulseStore.ts      Zustand + persist
  +-- slices/
      +-- projectSlice      Project state
      +-- kanbanSlice       Kanban state
      +-- uiSlice           UI state
      +-- agentSlice        Agent execution state
```

---

## 13. Directory Structure

```
AI native Jira/
+-- agents/                         # 15 Agent definitions
|   +-- researcher/                 #   soul.md + index.ts
|   +-- blue-team/
|   +-- critic/
|   +-- arbitrator/
|   +-- knowledge-curator/
|   +-- pm/
|   +-- tech-lead/
|   +-- orchestrator/
|   +-- developer/
|   +-- qa/
|   +-- reviewer/
|   +-- deployer/
|   +-- decision-maker/             #   [Meta] New
|   +-- architect/                  #   [Meta] New
|   +-- supervisor/                 #   [Meta] New
|   +-- utils.ts                    #   loadSoul, mergeSoulWithPrompt
|
+-- app/                            # Next.js App Router
|   +-- (dashboard)/                #   Frontend pages
|   +-- api/
|       +-- analyze/route.ts        #   Traditional pipeline
|       +-- meta/route.ts           #   Meta pipeline (New)
|       +-- projects/               #   Project CRUD + execute
|       +-- signals/                #   Signal management
|       +-- cron/
|       |   +-- collect-signals/    #   External signal fetching
|       |   +-- process-signals/    #   Batch processing (New)
|       +-- settings/               #   Config endpoints
|
+-- components/                     # React UI components
+-- connectors/
|   +-- bus/
|   |   +-- message-bus.ts          #   EventEmitter pub/sub
|   |   +-- types.ts                #   AgentMessage types
|   |   +-- channels.ts             #   Channel definitions
|   +-- external/                   #   3rd-party API clients
|
+-- lib/
|   +-- core/
|   |   +-- base-agent.ts           #   ReAct loop + single-shot
|   |   +-- base-tool.ts            #   Zod-validated tool base
|   |   +-- llm.ts                  #   LLM utilities
|   |   +-- types.ts                #   Core type definitions
|   +-- tools/                      #   34 tool implementations
|   |   +-- index.ts                #   Registry entry point
|   |   +-- tool-registry.ts        #   Map-backed registry
|   |   +-- spawn-agent.ts          #   Agent factory registry
|   |   +-- create-agent.ts         #   Dynamic agent creation
|   |   +-- create-skill.ts         #   Dynamic skill creation
|   |   +-- persist-agent.ts        #   Agent persistence
|   |   +-- ...                     #   (28 more tools)
|   +-- skills/                     #   Skill registry + loader
|   +-- prompts/                    #   System prompts (11 files)
|   +-- config/                     #   Agent/tool/template config
|   +-- services/                   #   RAG, sensing, signals
|   +-- db/                         #   Supabase client
|   +-- sandbox/                    #   Workspace types
|   +-- utils/                      #   Helpers
|
+-- skills/                         # Pipeline orchestration
|   +-- prepare-pipeline.ts         #   Prepare stage
|   +-- plan-pipeline.ts            #   Plan stage
|   +-- implement-pipeline.ts       #   Implementation stage
|   +-- deploy-pipeline.ts          #   Deploy stage
|   +-- full-pipeline.ts            #   End-to-end
|   +-- meta-pipeline.ts            #   Meta pipeline (New)
|
+-- store/                          # Zustand state management
+-- database/migrations/            # SQL migrations
+-- scripts/                        # Dev/test utilities
```

---

## 14. Validation Strategy Matrix

```
  Agent Output Type     Validation Mode     Validator
  ===================   =================   ========================
  Researcher result     Lightweight         validate_output (tool)
  Knowledge context     Lightweight         validate_output (tool)
  Blue-team case        Lightweight         validate_output (tool)
  Critic critique       Lightweight         validate_output (tool)
  PM PRD                Lightweight         validate_output (tool)

  Developer code        Deep                spawn_agent('supervisor')
  Deployer result       Deep                spawn_agent('supervisor')
  Any (conf < 0.5)      Deep                spawn_agent('supervisor')

  Supervisor Verdict:
  +--------+------------------+-----------+
  | Verdict| Meaning          | Action    |
  +--------+------------------+-----------+
  | pass   | Acceptable       | Continue  |
  | warn   | OK with notes    | Continue  |
  | fail   | Must redo        | Retry x3  |
  +--------+------------------+-----------+
```

### 14.1 Per-task QA Gate（实现阶段）

Implementation Pipeline 中每个 developer task 完成后自动运行一次轻量 QA 校验，
在标记 `completed` 之前拦截不完整的产出。

```
  Developer task completes
          │
          ▼
  ┌─────────────────────────┐
  │  Phase 1: 结构检查       │  programmatic — 无 LLM 调用
  │  - summary 非空?         │
  │  - files_changed 非空?   │
  │  - tests_passing = true? │
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │  Phase 2: 语义完整性     │  single-shot LLM (generateJSON)
  │  比较 task description   │
  │  与 output summary/files │
  │  → completeness 0-100   │
  └────────────┬────────────┘
               │
       completeness ≥ 60?
          ├── Yes → ✅ QA gate passed → mark completed
          │
          └── No  → 已重试过?
                      ├── Yes → ⚠️ accept partial, tag quality flag
                      └── No  → 🔄 retry with QA feedback (50% budget)
                                     │
                                     ▼
                               Re-validate → mark completed (with or without flag)
```

**设计原则**：
- **只校验 developer 任务**：QA-engineer 和 code-reviewer 的产出不再二次校验（防止无限递归）
- **每个 task 最多重试 1 次**：重试预算 = 原始预算的 50%（不超过硬上限）
- **不阻断流水线**：校验失败但已重试的 task 仍标记 completed，但带 `validation.passed = false` 标记
- **成本可控**：Phase 1 无 LLM 调用，Phase 2 仅 1 次 single-shot 调用（非 ReAct 循环）

---

## 15. Configuration & Extension Points

```
  Extension Method          Location                     Purpose
  ======================    ==========================   ========================
  Add new Agent             agents/{name}/               soul.md + index.ts
  Add new Tool              lib/tools/{name}.ts          + register in index.ts
  Add new Skill             skills/{name}/SKILL.md       Auto-discovered
  Override Agent config     agents/config.json           model, maxLoops, soul
  Add signal source         Supabase: signal_sources     YouTube/Reddit/Twitter
  Add API endpoint          app/api/{path}/route.ts      Next.js App Router
  Add UI component          components/                  React component
  Dynamic (runtime)         create_agent / create_skill  Architect creates on-the-fly
```

---

## 16. Agent 详细分析（能力 & 协作关系）

> 本节对系统中所有 15 个 Agent 逐一分析：核心能力、Soul 哲学、工具集、执行模式，以及与其他 Agent 的协作关系。

### 16.1 Meta 治理层（3 个 Agent）

#### 16.1.1 Decision Maker — 决策入口

| 属性 | 值 |
|------|------|
| 注册名 | `decision_maker` |
| 执行模式 | ReAct Loop (最多 15 轮) |
| 退出工具 | `finish_decision` |
| 工具集 | `spawn_agent`, `list_agents`, `web_search`, `search_vision_knowledge`, `search_decisions`, `finish_decision` |

**核心能力**
- 接收单条或批量信号，按语义相似度聚合分组后逐组决策
- 通过 `spawn_agent` 调度子 Agent 收集多维度证据（市场数据、历史决策、愿景上下文）
- 输出结构化 `DecisionOutput`：decision (PROCEED/HALT/DEFER/ESCALATE) + confidence 分数
- 置信度校准：confidence >= 0.7 才允许 PROCEED，不可逆决策需 >= 0.85

**Soul 哲学**
- 证据先行：每个决策必须基于检索到的事实，证据不足时 DEFER
- 多元视角：不依赖单一信息来源，交叉验证
- 信号聚合：批量信号先合并相似需求，再统一决策

**协作关系**
```
Decision Maker
  ├── spawn → Knowledge Curator (建立上下文基线，始终第一个调用)
  ├── spawn → Researcher (获取市场数据和竞品信息)
  ├── spawn → Blue Team (商业论证，STAR case)
  ├── spawn → Critic (对抗性审查，风险评估)
  ├── spawn → Arbitrator (Blue/Red 仲裁)
  └── 输出 → Architect (PROCEED 时触发 Phase 2)
```

---

#### 16.1.2 Architect — 动态执行大脑

| 属性 | 值 |
|------|------|
| 注册名 | `architect` |
| 执行模式 | ReAct Loop (最多 30 轮) |
| 退出工具 | `finish_architect` |
| 工具集 | `spawn_agent`, `list_agents`, `create_agent`, `create_skill`, `persist_agent`, `validate_output`, `discover_skills`, `finish_architect`, `web_search`, `list_files`, `read_file` |

**核心能力**
- 系统的自适应执行引擎，将决策分解为子任务并驱动执行
- 与静态 DAG 编排不同，Architect 在 ReAct 循环中动态规划：观察 → 决定 → 行动 → 观察结果 → 调整
- 能力扩展：当现有 Agent/Skill 不足时，通过 `create_agent`/`create_skill` 动态创建
- 通过 `persist_agent` 将有复用价值的动态 Agent 持久化到磁盘
- 质量关卡：对关键产出（代码、部署）通过 `spawn_agent('supervisor')` 进行深度验证
- 每步最多重试 3 次，3 次失败后标记 failed 并调整计划

**Soul 哲学**
- 自适应执行：计划是假设，失败时即时重新规划
- 精准匹配：为每个子问题选择最优 Agent + 工具组合
- 减少浪费：工具能解决的不 spawn agent，简单的自己处理

**协作关系**
```
Architect
  ├── spawn → Developer (代码实现任务)
  ├── spawn → QA Engineer (测试验证)
  ├── spawn → Code Reviewer (代码审查)
  ├── spawn → Supervisor (深度验证 — 代码/部署等关键产出)
  ├── spawn → Researcher (补充调研)
  ├── spawn → Knowledge Curator (上下文检索)
  ├── spawn → 任意已注册 Agent
  ├── create → 动态 Agent (填补能力空白)
  ├── create → 动态 Skill (补充技能)
  ├── validate_output → 轻量验证 (非关键产出)
  └── 接收 ← Decision Maker (PROCEED 后启动)
```

---

#### 16.1.3 Supervisor — 质量守门人

| 属性 | 值 |
|------|------|
| 注册名 | `supervisor` |
| 执行模式 | ReAct Loop (最多 5 轮) |
| 退出工具 | 无（直接返回结构化 JSON） |
| 工具集 | `validate_output`, `read_file`, `list_files` |

**核心能力**
- 系统的深度质量验证网关，对关键 Agent 产出进行独立审查
- 5 维检查：完整性、正确性、质量、一致性、安全性
- 输出 `SupervisorVerdict`：pass / warn / fail + 置信度 + 问题列表
- fail 裁定必须包含具体的 suggestion 字段，指导重试方向
- 严重度分级：error (根本性问题) / warning (质量问题) / info (小观察)

**Soul 哲学**
- 信任但验证：Agent 是有能力的，但所有产出都需独立验证
- 上下文感知：理解需求和约束，"正确"在当前语境下的含义
- 比例原则：关键产出深度审查，低风险产出轻量检查
- 建设性反馈：拒绝时必须说明具体问题和修复建议

**协作关系**
```
Supervisor
  ├── 被调用 ← Architect (对 Developer/Deployer 等关键产出做深度验证)
  ├── 被调用 ← Architect (任何 confidence < 0.5 的产出)
  └── 裁定 → Architect (pass → 继续 / fail → 重试最多 3 次)
```

---

### 16.2 Prepare 评估层（5 个 Agent）

#### 16.2.1 Knowledge Curator — 知识管理员

| 属性 | 值 |
|------|------|
| 注册名 | `knowledge_curator` |
| 执行模式 | ReAct Loop (最多 8 轮) |
| 退出工具 | `finish_retrieval` |
| 工具集 | `search_vision_knowledge`, `search_decisions`, `search_code_artifacts`, `search_code_patterns`, `finish_retrieval` |

**核心能力**
- 团队的"活记忆"，通过多跳检索跨知识源聚合上下文
- 4 个知识维度检索：愿景文档、历史决策、代码制品、代码模式
- 先广度搜索，再根据结果质量决定是否深入追踪
- 发现线索时追踪到底（决策记录 → 代码模式 → 愿景描述）
- 只读操作，不做决策、不修改数据

**Soul 哲学**
- 上下文即力量：好的决策需要好的信息
- 宁多不漏：检索阶段覆盖比精确更重要
- 结构化输出：杂乱的信息等于没有信息

**协作关系**
```
Knowledge Curator
  ├── 被调用 ← Prepare Pipeline (第 1 步，建立上下文基线)
  ├── 被调用 ← Plan Pipeline (第 1 步，为 PM 和 Tech Lead 提供上下文)
  ├── 被调用 ← Decision Maker (spawn 调用，建立决策上下文)
  ├── 被调用 ← Architect (spawn 调用，补充任务上下文)
  ├── 输出 → Blue Team (愿景上下文 + 历史决策)
  ├── 输出 → Critic (提供验证基线)
  ├── 输出 → PM (产品上下文)
  └── 输出 → Tech Lead (代码模式 + 历史制品)
```

---

#### 16.2.2 Researcher — 市场侦察兵

| 属性 | 值 |
|------|------|
| 注册名 | `researcher` |
| 执行模式 | ReAct Loop (最多 5 轮) |
| 退出工具 | 无（运行至耗尽） |
| 工具集 | `web_search` |

**核心能力**
- 市场研究专家，通过结构化搜索策略收集竞品和市场信息
- 搜索策略：先广后窄，最多 3 次搜索
  - 第 1 次：行业主要玩家和市场概况
  - 第 2 次：最相关竞品的核心功能
  - 第 3 次（可选）：验证特定信息或差异化角度
- 只陈述事实，不做价值判断
- 搜索失败时如实报告"无可用信息"

**Soul 哲学**
- 事实第一：只陈述事实，不做价值判断
- 效率优先：最多 3 次搜索，每次目标明确
- 结构化输出：信息以清晰结构呈现，便于下游角色消费

**协作关系**
```
Researcher
  ├── 被调用 ← Prepare Pipeline (第 2 步)
  ├── 被调用 ← Decision Maker (spawn 调用，获取市场数据)
  ├── 被调用 ← Architect (spawn 调用，补充调研)
  └── 输出 → Blue Team (市场数据作为 MRD 论据支撑)
```

---

#### 16.2.3 Blue Team — 商业分析师（正方）

| 属性 | 值 |
|------|------|
| 注册名 | `blue_team` |
| 执行模式 | Single-shot (runOnce) |
| 退出工具 | 无 |
| 工具集 | 无 |

**核心能力**
- 首席商业分析师，为功能提案撰写 MRD（市场需求文档）
- 输出结构化分析：电梯演讲、TAM/SAM/SOM、用户画像、ROI 预估
- 双评分：`vision_alignment_score` + `market_opportunity_score`
- 以投资人路演的标准撰写，30 秒内说清核心价值

**Soul 哲学**
- 数据说话：每个论点都要有数据支撑
- 投资人视角：让不懂技术的决策者也能理解价值
- ROI 导向：说清投入多少、回报多少、多久回本
- 愿景对齐：所有商业论证回到产品长期愿景

**协作关系**
```
Blue Team
  ├── 接收 ← Researcher (市场数据作为论据)
  ├── 接收 ← Knowledge Curator (愿景上下文 + 历史决策)
  ├── 被调用 ← Prepare Pipeline (第 3 步)
  ├── 被调用 ← Decision Maker (spawn 调用)
  ├── 输出 → Critic (MRD 作为审查对象)
  └── 输出 → Arbitrator (作为正方论据)
```

---

#### 16.2.4 Critic — 风险审查官（反方）

| 属性 | 值 |
|------|------|
| 注册名 | `critic` |
| 执行模式 | ReAct Loop (最多 10 轮) |
| 退出工具 | 无 |
| 工具集 | `web_search` |
| 特殊 | 支持 DeepSeek reasoner 模型；reasoner 模式下自动降级为 runOnce |

**核心能力**
- 首席风险官，从技术、商业、市场三维度系统性审查提案
- 用 `web_search` 验证 Blue Team 的关键数据和论点
- 输出：技术风险列表、商业缺陷、ROI 质疑、机会成本分析
- 致命缺陷标准严格：只有完全违背愿景、技术不可能、ROI=0 才算致命

**Soul 哲学**
- 怀疑一切：质疑所有假设，尤其是 Blue Team 的乐观预期
- 基于事实：每个质疑必须有论据支撑
- 搜索验证：如果 Blue Team 引用了数据，用 web_search 验证
- 商业审计视角：不仅看技术风险，更要审查 ROI、市场假设、机会成本

**协作关系**
```
Critic
  ├── 接收 ← Blue Team (MRD 作为审查对象)
  ├── 接收 ← Knowledge Curator (上下文基线)
  ├── 被调用 ← Prepare Pipeline (第 4 步)
  ├── 被调用 ← Decision Maker (spawn 调用)
  └── 输出 → Arbitrator (作为反方论据)
```

---

#### 16.2.5 Arbitrator — 仲裁者

| 属性 | 值 |
|------|------|
| 注册名 | `arbitrator` |
| 执行模式 | Single-shot (runOnce) |
| 退出工具 | 无 |
| 工具集 | 无 |

**核心能力**
- Blue Team 与 Red Team 之间的最终裁判
- 加权评分体系：愿景对齐度 40% + 技术可行性 30% + 市场机会 30%
- 决策逻辑：total_score >= 60 → PROCEED，< 60 → CIRCUIT_BREAK
- 致命缺陷覆盖：存在 fatal_flaw → 强制 CIRCUIT_BREAK（无视分数）

**Soul 哲学**
- 客观公正：不偏向任何一方
- 标准严格：只有综合分 >= 60 才 PROCEED
- 致命缺陷优先：存在致命缺陷则强制否决
- 透明决策：裁决理由必须包含评分细节和逻辑链

**协作关系**
```
Arbitrator
  ├── 接收 ← Blue Team (vision_alignment_score + MRD)
  ├── 接收 ← Critic (risks + fatal_flaws)
  ├── 被调用 ← Prepare Pipeline (第 5 步，最终裁决)
  ├── 被调用 ← Decision Maker (spawn 调用)
  └── 输出 → Pipeline (PROCEED / CIRCUIT_BREAK)
```

---

### 16.3 Plan 规划层（3 个 Agent）

#### 16.3.1 Product Manager (PM) — 产品经理

| 属性 | 值 |
|------|------|
| 注册名 | `product_manager` |
| 执行模式 | Single-shot (runOnce) |
| 退出工具 | 无 |
| 工具集 | 无 |

**核心能力**
- 将模糊的用户想法转化为清晰可执行的 PRD（产品需求文档）
- 输出结构化 JSON：title, description, acceptance_criteria, priority_score
- 双评分：vision_alignment + score，附 decision (GO/NO_GO)
- 需求与愿景冲突时明确给出 NO_GO

**Soul 哲学**
- 用户优先：所有决策以用户价值为第一驱动力
- 愿景对齐：每个功能必须服务于产品长期愿景
- 简洁表达：复杂问题用简单语言描述
- 数据驱动：用数据支撑决策

**协作关系**
```
Product Manager
  ├── 接收 ← Knowledge Curator (愿景上下文 + 历史决策)
  ├── 接收 ← Prepare Pipeline (用户需求描述)
  ├── 被调用 ← Plan Pipeline (第 2 步)
  └── 输出 → Tech Lead (PRD 作为技术分解的输入)
```

---

#### 16.3.2 Tech Lead — 技术负责人

| 属性 | 值 |
|------|------|
| 注册名 | `tech_lead` |
| 执行模式 | ReAct Loop (最多 15 轮) |
| 退出工具 | `finish_planning` |
| 工具集 | `list_files`, `read_file`, `finish_planning` |

**核心能力**
- 将 PRD 转化为精准的开发任务列表
- 先用 `list_files` 了解项目结构，再用 `read_file` 理解关键代码模式
- 任务粒度：一个任务对应 1-3 个文件修改
- 输出：rationale + tasks[{ id, description, affected_files, depends_on, estimated_complexity, priority }]
- 区分 feature/bug/chore，优先级基于阻塞关系

**Soul 哲学**
- 代码即真相：不猜测，先用工具查看真实代码结构
- 渐进式实现：任务粒度适中
- 负面模式避免：从过往失败中学习
- 依赖有序：基础设施先行，上层功能后建

**协作关系**
```
Tech Lead
  ├── 接收 ← Product Manager (PRD)
  ├── 接收 ← Knowledge Curator (代码模式 + 历史制品 + 负面模式)
  ├── 被调用 ← Plan Pipeline (第 3 步)
  └── 输出 → Orchestrator / Developer (任务列表供实现阶段消费)
```

---

#### 16.3.3 Orchestrator — 编排者

| 属性 | 值 |
|------|------|
| 注册名 | `orchestrator` |
| 执行模式 | ReAct Loop (最多 25 轮) |
| 退出工具 | `finish_planning` |
| 工具集 | `web_search`, `list_files`, `read_file`, `finish_planning` |

**核心能力**
- 全局视角的系统架构师，不亲自写代码，指挥其他 Agent 协作
- 将需求拆解为可独立执行的子任务，生成 DAG（有向无环图）
- 为每个任务选择最合适的 agent 模板和工具
- 输出可拓扑排序的 ImplementationPlan，最后一个任务应是 QA 验证

**Soul 哲学**
- 分而治之：复杂问题拆解为可独立执行的子任务
- 最小权限：每个 Agent 只获得完成任务所需的最少工具和上下文
- 依赖清晰：任务间依赖关系必须显式声明
- 容错设计：单个任务失败不应导致整个计划崩溃

**协作关系**
```
Orchestrator
  ├── 接收 ← Implement Pipeline (PRD + Plan)
  ├── 输出 → Developer (DAG 中的开发任务)
  ├── 输出 → QA Engineer (DAG 中的验证任务)
  └── 输出 → Code Reviewer (DAG 中的审查任务)
```

---

### 16.4 Implement 实现层（3 个 Agent）

#### 16.4.1 Developer — 开发者

| 属性 | 值 |
|------|------|
| 注册名 | `developer` |
| 执行模式 | ReAct Loop (最多 20 轮) |
| 退出工具 | `finish_implementation` |
| 工具集 | `list_files`, `read_file`, `code_write`, `code_edit`, `run_command`, `run_tests`, `git_commit`, `finish_implementation` (workspace-scoped，由调用方注入) |
| 特殊 | 支持 Skill 注入；可选 specialization (default: fullstack) |

**核心能力**
- 注重实效的软件工程师，执行具体的代码编写和修改任务
- 严格的工具使用纪律：先观察（list_files → read_file）再行动
- 区分 code_write（新建）和 code_edit（修改），禁止跳过检查步骤
- 每次 commit 只包含一个逻辑单元的改动
- 错误恢复：工具调用失败后分析原因，连续两次失败则重新审视计划

**Soul 哲学**
- YAGNI：只实现当前需要的功能
- 测试优先：改动必须可验证
- 最小改动：精确修改，不做无关重构
- 尊重现有代码：遵循项目已有的模式和风格

**协作关系**
```
Developer
  ├── 被调用 ← Implement Pipeline (按 DAG 顺序执行开发任务)
  ├── 被调用 ← Architect (spawn 调用)
  ├── 产出 → QA Engineer (代码提交后由 QA 验证)
  ├── 产出 → Code Reviewer (代码提交后由 Reviewer 审查)
  └── 产出 → Supervisor (通过 Architect 调用时，关键产出需深度验证)
```

---

#### 16.4.2 QA Engineer — 质量工程师

| 属性 | 值 |
|------|------|
| 注册名 | `qa_engineer` |
| 执行模式 | ReAct Loop (最多 10 轮) |
| 退出工具 | `finish_implementation` |
| 工具集 | 由调用方注入 (workspace-scoped): `run_tests`, `run_command`, `list_files`, `read_file` 等 |

**核心能力**
- 严谨的质量工程师，确保交付代码正确、安全、可靠
- 验证清单：回归测试 → 新代码覆盖 → 项目规范 → 安全隐患 → TypeScript 类型
- 先运行完整测试套件确认基线，再关注边界情况和异常路径
- 给出明确的 pass/fail 结论并附证据

**Soul 哲学**
- 怀疑一切：假设代码有 bug，直到测试证明它没有
- 用户视角：站在最终用户角度验证功能
- 回归意识：新改动不能破坏已有功能
- 量化报告：用数据说话

**协作关系**
```
QA Engineer
  ├── 接收 ← Developer (验证 Developer 的代码产出)
  ├── 被调用 ← Implement Pipeline (DAG 中的 QA 任务)
  ├── 被调用 ← Architect (spawn 调用)
  └── 输出 → Code Reviewer / Pipeline (pass/fail 结论)
```

---

#### 16.4.3 Code Reviewer — 代码审查者

| 属性 | 值 |
|------|------|
| 注册名 | `code_reviewer` |
| 执行模式 | ReAct Loop (最多 10 轮) |
| 退出工具 | `finish_implementation` |
| 工具集 | 由调用方注入 (workspace-scoped): `list_files`, `read_file` 等 |

**核心能力**
- 经验丰富的 Senior Engineer，专门负责代码审查
- 5 维审查：正确性 → 安全性 → 性能 → 可维护性 → 一致性
- 输出 approve 或 request_changes，附具体文件和行号引用
- 关注改动对整体架构的影响，而非只是局部正确性

**Soul 哲学**
- 建设性：指出问题的同时给出改进建议
- 优先级明确：区分必须修复的错误和可选的改进建议
- 全局视野：关注对整体架构的影响
- 实事求是：只报告真实问题，不吹毛求疵

**协作关系**
```
Code Reviewer
  ├── 接收 ← Developer + QA (审查已通过测试的代码)
  ├── 被调用 ← Implement Pipeline (DAG 中最后阶段)
  ├── 被调用 ← Architect (spawn 调用)
  └── 输出 → Pipeline (approve → 创建 PR / request_changes → 回退)
```

---

### 16.5 Deploy 部署层（1 个 Agent）

#### 16.5.1 Deployer — DevOps 工程师

| 属性 | 值 |
|------|------|
| 注册名 | `deployer` |
| 执行模式 | ReAct Loop (最多 15 轮) |
| 退出工具 | `finish_deploy` |
| 工具集 | `check_ci`, `merge_pr`, `trigger_deploy`, `check_health`, `finish_deploy` |

**核心能力**
- 冷静精确的 DevOps 工程师，负责生产环境部署全流程
- 工作流：check_ci → merge_pr (squash) → trigger_deploy → check_health
- 自动回滚：健康检查失败时创建 revert PR 并合并
- 支持 Vercel、GitHub Pages 等多种部署目标

**Soul 哲学**
- 安全第一：合并前必须确认 CI 全部通过
- 可观测性：部署后必须健康检查
- 快速回滚：健康检查失败立即触发回滚
- 清晰沟通：每步操作都有明确日志

**启动/预览前就绪检查（Pre-launch Readiness）**
- **职责归属**：正式启动项目（含本地预览、部署）前，由 Deployer 负责对项目做一次走查，判断有无缺失项，避免预览空白、dev server 崩溃等问题。
- **检查范围**（可随实践补充）：
  1. 必要文件：`app/layout.tsx`、`app/page.tsx`（或对应路由）、`globals.css`、Tailwind 配置
  2. 路由冲突：如 `[id]` 与 `[leadId]` 等动态路由命名冲突
  3. 编译/语法：JSDoc 等注释导致的构建失败（如 `*/` 被误解析）
  4. 前端依赖：页面引用的组件是否存在（如 Spinner、Badge、TextArea）
  5. 后端/连接器桩：如 `lib/db/client`、`connectors/external/supabase` 等被引用但可能缺失的模块
- **执行时机**：在「启动本地预览」或「触发部署」之前执行；可与 preview-manager 的 scaffold 互补（scaffold 自动补文件，Deployer 走查发现并报告/修复剩余项）。
- **与 Supervisor 的关系**：若 pipeline 需要「项目就绪」的正式裁定，可由 Architect 在启动前 spawn Supervisor，对 Deployer 的走查结果或 checklist 做验证（pass/warn/fail）。

**协作关系**
```
Deployer
  ├── 接收 ← Deploy Pipeline (PR 号 + 仓库信息)
  ├── 接收 ← Architect (spawn 调用)
  ├── 产出 → Supervisor (通过 Architect 调用时，部署结果需深度验证)
  ├── 启动/预览前 → 执行就绪走查（见上）
  └── 独立执行 (不 spawn 其他 Agent，通过工具完成全部操作)
```

---

## 17. Agent 协作全景图

### 17.1 Pipeline 级协作（端到端流水线）

```
                          ┌─────────────────────────┐
                          │     SIGNAL INPUT         │
                          │ (Manual / YouTube /      │
                          │  Reddit / Twitter)       │
                          └───────────┬─────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
     Meta Pipeline             Traditional Pipeline     Cron Pipeline
     (POST /api/meta)         (POST /api/analyze)      (POST /api/cron)
              │                       │                       │
              ▼                       ▼                       │
     ┌────────────────┐      ┌────────────────┐              │
     │ Decision Maker │      │    PREPARE      │              │
     │ (Phase 1)      │      │                 │              │
     │  spawns:       │      │ Kn.Curator      │◄─────────────┘
     │  - Kn.Curator  │      │     ↓           │
     │  - Researcher  │      │ Researcher      │
     │  - Blue Team   │      │     ↓           │
     │  - Critic      │      │ Blue Team       │
     │  - Arbitrator  │      │     ↓           │
     └───────┬────────┘      │ Critic          │
             │ PROCEED       │     ↓           │
             ▼               │ Arbitrator      │
     ┌────────────────┐      │  → PROCEED/HALT │
     │ Architect      │      └────────┬────────┘
     │ (Phase 2)      │               │ PROCEED
     │  spawns:       │               ▼
     │  - Developer   │      ┌────────────────┐
     │  - QA          │      │     PLAN        │
     │  - Reviewer    │      │                 │
     │  - Supervisor  │      │ Kn.Curator      │
     │  - any agent   │      │     ↓           │
     │  creates:      │      │ PM → PRD        │
     │  - new agents  │      │     ↓           │
     │  - new skills  │      │ Tech Lead       │
     └───────┬────────┘      │  → Tasks        │
             │               └────────┬────────┘
             │                        │
             │                        ▼
             │               ┌────────────────┐
             │               │   IMPLEMENT     │
             │               │                 │
             │               │ Orchestrator    │
             │               │  → DAG          │
             │               │     ↓           │
             │               │ Developer ×N    │
             │               │     ↓           │
             │               │ QA Engineer     │
             │               │     ↓           │
             │               │ Code Reviewer   │
             │               │  → PR           │
             │               └────────┬────────┘
             │                        │
             ▼                        ▼
     ┌────────────────┐      ┌────────────────┐
     │   RESULT        │      │    DEPLOY       │
     │ MetaPipeline    │      │                 │
     │ Result          │      │ Deployer        │
     │ { decision,     │      │  check_ci       │
     │   architect }   │      │  merge_pr       │
     └────────────────┘      │  trigger_deploy │
                              │  check_health   │
                              └────────────────┘
```

### 17.2 Agent 直接协作矩阵

下表展示 Agent 之间的直接调用/依赖关系（✦ = spawn 调用, ● = 数据依赖, ○ = 可选依赖）：

```
                   被调用方 →
调用方 ↓          KC   RS   BT   CR   AR   PM   TL   OC   DV   QA   RV   DP   SV
─────────────────────────────────────────────────────────────────────────────────
Decision Maker    ✦    ✦    ✦    ✦    ✦    .    .    .    .    .    .    .    .
Architect         ✦    ✦    .    .    .    .    .    .    ✦    ✦    ✦    ✦    ✦
Prepare Pipeline  ●    ●    ●    ●    ●    .    .    .    .    .    .    .    .
Plan Pipeline     ●    .    .    .    .    ●    ●    .    .    .    .    .    .
Impl Pipeline     .    .    .    .    .    .    .    ●    ●    ●    ●    .    .
Deploy Pipeline   .    .    .    .    .    .    .    .    .    .    .    ●    .

KC = Knowledge Curator, RS = Researcher, BT = Blue Team, CR = Critic,
AR = Arbitrator, PM = Product Manager, TL = Tech Lead, OC = Orchestrator,
DV = Developer, QA = QA Engineer, RV = Code Reviewer, DP = Deployer,
SV = Supervisor
```

### 17.3 信息流传递链

```
Knowledge Curator ──context──→ Blue Team ──MRD──→ Arbitrator
                  ──context──→ Critic ──risks──→ Arbitrator
                  ──context──→ PM ──PRD──→ Tech Lead ──tasks──→ Orchestrator
                                                               ──DAG──→ Developer
                                                                        ──code──→ QA
                                                                        ──code──→ Reviewer
                                                                        ──PR──→ Deployer

Researcher ──market data──→ Blue Team
           ──market data──→ Critic (间接：用于验证 Blue Team 的论点)
```

### 17.4 Prepare 阶段 Blue/Red 对抗模型

```
                 ┌─────────────────┐
                 │ Knowledge Curator│
                 │ (上下文基线)     │
                 └────────┬────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
     ┌────────────────┐      ┌────────────────┐
     │ Researcher     │      │                │
     │ (市场数据)     │──────│  RAG Context    │
     └────────┬───────┘      └───────┬────────┘
              │                      │
              ▼                      │
     ┌────────────────┐              │
     │ Blue Team      │◄─────────────┘
     │ (正方 — MRD)   │
     └────────┬───────┘
              │ MRD + scores
              │
    ┌─────────┴──────────┐
    ▼                    ▼
┌─────────┐     ┌────────────────┐
│ Critic  │     │                │
│ (反方)  │     │ (Blue Team 的   │
│ web验证 │     │  数据被传递)   │
└────┬────┘     └────────────────┘
     │ risks + fatal_flaws
     │
     ▼
┌────────────────┐
│ Arbitrator     │
│ Blue + Red →   │
│ 加权评分裁决   │
│ >= 60: PROCEED │
│ < 60: HALT     │
│ fatal: HALT    │
└────────────────┘
```

---

## 18. 核心设计决策总结

| 设计决策 | 选择 | 原因 |
|---------|------|------|
| Agent 身份系统 | Soul.md 文件 | 使每个 Agent 有一致的人格和行为准则，支持 AI 动态生成新 Agent |
| 执行模式 | ReAct Loop + Single-shot | ReAct 用于需要工具交互的 Agent，Single-shot 用于纯推理决策 |
| Agent/Tool 注册 | Map-backed Factory | 运行时可扩展，无需代码变更 |
| 验证策略 | 轻量 + 深度分级 | 非关键产出用 validate_output，关键产出（代码/部署）用 Supervisor |
| Agent 通信 | EventEmitter Message Bus | Agent 解耦，不直接 import；支持实时 SSE 推送到前端 |
| 知识检索 | pgvector 256-dim | 统一向量化存储，支持跨知识源语义搜索 |
| 编排方式 | 静态 DAG (Orchestrator) + 自适应 (Architect) | Orchestrator 用于传统流水线，Architect 用于动态场景 |
| 动态 Agent 生命周期 | Session-level + persist_agent | 默认临时（会话结束清理），有价值时持久化到磁盘 |
| Prepare 对抗模型 | Blue/Red Team + Arbitrator | 避免单一视角偏见，通过对抗产生更客观的评估 |
| 置信度驱动 | Decision Maker confidence 阈值 | 低置信度触发额外证据收集或人工介入 |

---

## 19. 系统优化分析（Claude Code 视角）

> 以下从安全、稳定性、可靠性、可维护性、性能、架构演进六个维度对当前系统进行审计，按优先级排列。

### 19.1 P0 — CRITICAL（必须修复）

#### OPT-01: API 层无任何认证与鉴权

| 属性 | 值 |
|------|------|
| 涉及文件 | `app/api/meta/route.ts`, `app/api/analyze/route.ts`, 所有 `/api/` 路由 |
| 影响面 | 安全 |
| 严重度 | CRITICAL |

**问题**: 所有 API 端点完全裸露，无认证机制。`POST /api/meta` 可触发整个 Meta Pipeline（Decision Maker → Architect → spawn 任意 Agent），包括执行 shell 命令（`run_command`）、写文件（`code_write`）、git 操作等。任何人可通过一个 HTTP 请求触发系统执行任意代码。

```typescript
// app/api/meta/route.ts:47
export async function POST(req: Request) {
  let body;
  try { body = await req.json(); } catch { ... }
  // 没有 auth check，直接进入 pipeline
  return makeStreamResponse(async (writer) => {
    const result = await runMetaPipeline(description, { ... });
  });
}
```

**建议**:
- 增加 API Key / Bearer Token 验证中间件
- `/api/cron/*` 端点需要 Vercel Cron Secret 验证
- 敏感操作（implement, deploy）增加二次确认机制

---

#### OPT-02: `run_command` 工具存在命令注入风险

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/tools/run-command.ts` |
| 影响面 | 安全 |
| 严重度 | CRITICAL |

**问题**: Developer Agent 拥有 `run_command` 工具，可执行任意 shell 命令。LLM 输出不可控，若 Agent 被 prompt injection 攻击（通过恶意信号内容），可在服务器上执行任意命令。

**建议**:
- 实现命令白名单（仅允许 `npm`, `npx`, `tsc`, `jest` 等）
- 禁止包含 `|`, `;`, `&&`, `` ` `` 等 shell 元字符的命令
- 使用 `child_process.execFile` 替代 `exec` 避免 shell 解析

---

#### OPT-03: Supabase Service Role Key 暴露风险

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/db/client.ts:16` |
| 影响面 | 安全 |
| 严重度 | CRITICAL |

**问题**: Service Role Key 绕过 RLS（行级安全策略），拥有数据库完全访问权限。`NEXT_PUBLIC_SUPABASE_URL` 前缀暗示 URL 在客户端可见，若 `client.ts` 被意外引入客户端 bundle，Service Role Key 会泄露。

```typescript
// lib/db/client.ts:16-19
export const supabase = createClient(
  supabaseUrl || "https://missing-credentials.example.com",
  supabaseKey || "missing-key"  // SUPABASE_SERVICE_ROLE_KEY
);
```

**建议**:
- 确认 `lib/db/client.ts` 永不被客户端代码 import
- 使用 `server-only` 包保护（`import 'server-only'`）
- 环境变量缺失时 throw 而非静默降级

---

### 19.2 P1 — HIGH（强烈建议修复）

#### OPT-04: BaseAgent ReAct Loop 消息数组无界增长

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/core/base-agent.ts:40, 67, 104, 112, 134` |
| 影响面 | 稳定性 / 成本 |
| 严重度 | HIGH |

**问题**: `messages` 数组在循环中持续 push，无裁剪。Architect（30 轮）每轮可能有多个 tool call，30 轮后 messages 可能 200+ 条。加上 tool 结果中包含的完整文件内容，可达数十 MB。

```
Architect 最坏情况:
30 轮 × 3 tool calls/轮 = 90 条 tool 消息
+ 30 条 assistant 消息
+ system + user = 122+ 条消息
```

**影响**:
- 内存消耗大
- 超出 LLM token 上下文窗口导致 API 报错
- 增加 token 费用（每轮发送完整历史）

**建议**:
- 实现滑动窗口或消息摘要机制（保留 system + 最近 N 条）
- 对 tool 结果做长度截断（> 4000 chars 时保留头尾摘要）
- 监控当前 token 使用量，接近上限时主动压缩历史

---

#### OPT-05: SSE 连接无超时、无心跳、客户端断开无感知

| 属性 | 值 |
|------|------|
| 涉及文件 | `app/api/meta/route.ts:26-36`, `app/api/analyze/route.ts:16-26` |
| 影响面 | 稳定性 |
| 严重度 | HIGH |

**问题**:
- **无超时**: Meta Pipeline 可运行数十分钟，SSE 连接无超时保护
- **无心跳**: 长时间无数据时代理/负载均衡器可能断开连接
- **客户端断开无感知**: 浏览器关闭或网络中断时，服务端 pipeline 继续运行但 `writer.write()` 静默失败，浪费 LLM API 费用

```typescript
(async () => {
  try {
    const data = await processor(writer); // 可能运行 30+ 分钟
    await writer.write(...);
  } catch (e: any) { ... }
  finally { await writer.close(); }
})();
```

**建议**:
- 增加 30s 心跳 (`data: {"type":"heartbeat"}\n\n`)
- 通过 `req.signal` / `AbortController` 监听客户端断开
- 设置整体超时（如 30 分钟 hard limit）

---

#### OPT-06: 动态 Agent/Skill 注册表无上限 — 内存泄漏

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/tools/spawn-agent.ts:15`, `lib/tools/create-agent.ts:29`, `lib/tools/tool-registry.ts:11` |
| 影响面 | 稳定性 |
| 严重度 | HIGH |

**问题**: 三个全局 Map（`agentFactories`, `dynamicAgents`, `registry`）在 Node.js 进程生命周期内只增不减。Meta Pipeline 末尾虽有清理逻辑，但仅清理已报告且 `persistent=false` 的条目。Pipeline 中途崩溃时无清理。

```typescript
// meta-pipeline.ts:124-128 — 只清理已报告的
for (const agent of dynamicAgents) {
  if (!agent.persistent && createdAgents.includes(agent.id)) {
    removeDynamicAgent(agent.id); // 且不清理 factory 注册
  }
}
```

**建议**:
- 为动态 Agent Map 设置上限（如 100）
- 实现 TTL 过期机制
- Pipeline 异常时也执行 cleanup（`finally` 块）
- `removeDynamicAgent` 应同步清理 `agentFactories` 和 `agent-registry`（见 OPT-10）

---

#### OPT-07: LLM 输出结构无运行时校验

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/skills/prepare.ts`, `lib/skills/plan.ts`, `skills/meta-pipeline.ts` |
| 影响面 | 可靠性 |
| 严重度 | HIGH |

**问题**: 系统大量依赖 LLM 输出特定 JSON 结构（DecisionOutput, MRD, PRD, 任务列表等），但除了 `JSON.parse` 外无 schema 验证。

```typescript
// lib/skills/prepare.ts:159 — 直接使用，不验证结构
const blueResult = await generateJSON(BLUE_TEAM_PROMPT, ...);
// 如果 LLM 没返回 vision_alignment_score 字段就是 undefined

// skills/meta-pipeline.ts:77 — 直接 cast，不验证
decision = dmResult as DecisionOutput;
// 如果缺少 confidence 字段，后续 decision.confidence 就是 undefined
```

**建议**: 对关键 Agent 输出使用 Zod schema 做运行时验证（系统已依赖 Zod），失败时提供有意义的错误信息。

---

#### OPT-08: 无测试基础设施

| 属性 | 值 |
|------|------|
| 涉及文件 | `package.json` |
| 影响面 | 可维护性 |
| 严重度 | HIGH |

**问题**: `package.json` 无测试框架依赖，整个项目无测试文件。对于 15 个 Agent、34 个工具、5 条 Pipeline 的复杂系统，每次改动都是盲飞。

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
  // 没有 "test" 脚本
}
```

**建议**: 至少为核心层增加单元测试:
- `cleanJSON()` — 边界情况覆盖
- `topoSort()` — 环检测、空输入
- `BaseTool.execute()` — 输入校验
- `ValidateOutputTool` — 各种输出格式
- Pipeline 的 mock 集成测试

---

### 19.3 P2 — MEDIUM（建议优化）

#### OPT-09: ReAct Loop 无 API 调用超时

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/core/base-agent.ts:58` |
| 影响面 | 稳定性 |

**问题**: `this.openai.chat.completions.create()` 无 timeout 参数。若 OpenAI API 挂起，整个 Agent 无限等待，在 Architect (30轮) 中一次挂起阻塞整个 pipeline。

**建议**: 使用 OpenAI SDK 的 `timeout` 选项或包装 `Promise.race` with `AbortController`。

---

#### OPT-10: `removeDynamicAgent` 不清理 factory 和 metadata 注册

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/tools/create-agent.ts:39-41` |
| 影响面 | 正确性 |

**问题**: `removeDynamicAgent` 只从 `dynamicAgents` Map 删除定义，`agentFactories` Map 和 agent-registry metadata 未清理。"已删除" 的 Agent 仍可被 `spawn_agent` 调用。

```typescript
export function removeDynamicAgent(id: string): boolean {
  return dynamicAgents.delete(id);  // 只删了定义，factory 还在
}
```

**建议**: 同步调用 `deregisterAgentFactory(id)` 和 `deregisterAgent(id)`（需新增）。

---

#### OPT-11: MessageBus 单例 — 跨请求状态污染

| 属性 | 值 |
|------|------|
| 涉及文件 | `connectors/bus/message-bus.ts:130` |
| 影响面 | 正确性 |

**问题**: Next.js serverless 环境中模块级单例可能跨请求复用。两个并发 pipeline 的消息会混在同一个 bus 上。`reset()` 方法存在但 meta-pipeline 中未调用。

**建议**: 每次 pipeline 执行创建独立 MessageBus 实例，或至少在开始时 `reset()` 并添加 `runId` 标识。

---

#### OPT-12: Prepare Pipeline 中关键 Agent 失败被静默吞掉

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/skills/prepare.ts:144-155, 177-200` |
| 影响面 | 决策质量 |

**问题**: Researcher 和 Critic 是评估质量的关键环节，失败后用默认值继续。Blue Team 的 MRD 没有市场数据支撑，Arbitrator 没有风险审查可参考，导致决策质量下降但系统可能错误地 PROCEED。

```typescript
// Researcher 失败 — 静默降级
catch (e: any) {
  competitorContext = 'No market context available.';
}
// Critic 失败 — 静默降级
catch (e: any) {
  redResult = { critique: 'Red Team analysis inconclusive.', ... };
}
```

**建议**: 在 Arbitrator 输入中标注 "Researcher/Critic 失败"，让 Arbitrator 在信息不完整时倾向保守决策；或直接 CIRCUIT_BREAK。

---

#### OPT-13: Serverless 超时限制不适合长时间 Pipeline

| 属性 | 值 |
|------|------|
| 涉及文件 | `app/api/meta/route.ts`, `skills/meta-pipeline.ts` |
| 影响面 | 可用性 |

**问题**: Meta Pipeline（DM 15轮 + Architect 30轮）可运行 10-30 分钟。Vercel serverless 默认 10s 超时（Pro 60s，Enterprise 900s）。

**建议**:
- 将 pipeline 执行移至 background job（Vercel Background Functions 或独立 worker）
- API 返回 job ID + SSE 监听端点
- 或使用 Inngest / Trigger.dev 等任务队列

---

#### OPT-14: SSE 流 `makeStreamResponse` 代码完全重复

| 属性 | 值 |
|------|------|
| 涉及文件 | `app/api/meta/route.ts:19-45`, `app/api/analyze/route.ts:9-35` |
| 影响面 | 可维护性 |

**问题**: 两个文件中 `makeStreamResponse` 函数完全相同（逐字复制）。

**建议**: 提取到 `lib/utils/sse.ts` 共享模块。

---

#### OPT-15: Embedding 生成失败静默返回空数组

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/services/rag.ts:10-30` |
| 影响面 | 可靠性 |

**问题**: 所有依赖 embedding 的功能在 API Key 缺失或 API 故障时静默降级为无结果。调用方无法区分 "没有相关内容" 和 "embedding 服务故障"。

```typescript
export async function generateEmbedding(text: string) {
  if (!process.env.OPENAI_API_KEY) return [];  // 静默失败
  try { ... }
  catch (e) { return []; }  // 失败也返回空数组
}
```

**建议**: 返回 `{ embedding: number[], error?: string }` 结构体，或在关键路径上 throw。

---

### 19.4 P3 — LOW（改进建议）

#### OPT-16: `generateJSON` 每次调用可能创建新 OpenAI Client

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/core/llm.ts:100` |
| 影响面 | 性能 |

**问题**: 未传 `client` 选项时每次 `new OpenAI()`，在 Prepare Pipeline 中至少被调用 2 次。

**建议**: 模块级单例 client，或 pipeline 级别共享。

---

#### OPT-17: `toFunctionDef()` 无缓存 — Zod → JSON Schema 重复转换

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/core/base-tool.ts:26-37` |
| 影响面 | 性能 |

**问题**: `toFunctionDef()` 在 BaseAgent 每次循环前都被调用。10 个工具 × 30 轮 = 300 次不必要的 Zod → JSON Schema 转换。

**建议**: 在 BaseTool 中惰性缓存 `toFunctionDef()` 结果；或在 BaseAgent 构造时预计算一次。

---

#### OPT-18: `AgentContext` index signature 破坏类型安全

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/core/types.ts:3-9` |
| 影响面 | 可维护性 |

**问题**: `[key: string]: any` 允许任意属性，绕过所有 TypeScript 检查。

**建议**: 移除 index signature，显式声明所有字段。

---

#### OPT-19: BaseAgent 构造函数 model 赋值冗余

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/core/base-agent.ts:11-15` |
| 影响面 | 可维护性 |

**问题**: `model` 被赋值 3 次，其中 line 13 的赋值永远不会生效（被 line 14 spread + line 15 覆盖）。

```typescript
this.config = {
  maxLoops: 10,
  model: process.env.LLM_MODEL_NAME || 'gpt-4o',           // L13: 无效赋值
  ...config,                                                 // L14: 覆盖
  model: config.model ?? process.env.LLM_MODEL_NAME ?? 'gpt-4o', // L15: 再覆盖
};
```

---

#### OPT-20: `ToolExecutionResult` 允许非法状态

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/core/types.ts:21-25` |
| 影响面 | 可维护性 |

**问题**: `data` 和 `error` 都是 optional，允许 `{ success: true, error: "x" }` 等矛盾状态。

**建议**: 使用 discriminated union:
```typescript
type ToolExecutionResult =
  | { success: true; data: unknown }
  | { success: false; error: string };
```

---

#### OPT-21: `cleanJSON` 贪婪正则匹配问题

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/core/llm.ts:74` |
| 影响面 | 可靠性 |

**问题**: `/\{[\s\S]*\}/` 贪婪匹配，若 LLM 输出多个独立 JSON 对象（`{a:1} text {b:2}`），会匹配 `{a:1} text {b:2}` 导致 parse 失败。

---

#### OPT-22: Supabase Client 使用虚假 URL 作为 fallback

| 属性 | 值 |
|------|------|
| 涉及文件 | `lib/db/client.ts:16-19` |
| 影响面 | 可靠性 |

**问题**: 环境变量缺失时创建指向虚假 URL 的 client，所有 DB 操作静默失败。

**建议**: 缺少环境变量时直接 throw；或 lazy initialization。

---

### 19.5 架构级优化建议

#### OPT-23: Orchestrator 与 Architect 职责重叠

**问题**: Orchestrator（Plan 阶段 → DAG）和 Architect（Meta 阶段 → 动态执行）本质上都在做 "分解任务 + 编排执行"，tools 和 soul 有大量重叠。

**建议**: 考虑统一为 Architect 作为唯一编排器，Traditional Pipeline 也通过 Architect 驱动（相当于 `skipDecision=true` 的 Meta Pipeline）。

---

#### OPT-24: 缺少可观测性基础设施

**问题**: 唯一日志方式是 `console.log/error` + SSE 流。缺少：
- 结构化日志（`traceId` 已定义在 `AgentContext` 中但从未使用）
- Metrics（Agent 执行时间、LLM token 消耗、成功/失败率）
- Cost tracking（每次 pipeline 运行的 API 费用）

**建议**:
- 激活 `AgentContext.traceId`，串联一次请求的完整链路
- 在 `BaseAgent.run()` 中记录每次 LLM 调用的 `usage` (tokens) 并汇总
- 增加 pipeline 级别的执行摘要（总耗时、总 token、总 API 调用数）

---

### 19.6 优化优先级总览

```
优先级    编号        问题                                 影响面
=======   =========   ==================================   ===========
P0        OPT-01      API 无认证                           安全
P0        OPT-02      命令注入风险                         安全
P0        OPT-03      Service Role Key 暴露风险            安全

P1        OPT-04      消息数组无界增长                     稳定性/成本
P1        OPT-05      SSE 连接无超时/心跳                  稳定性
P1        OPT-06      内存泄漏(动态 Agent)                 稳定性
P1        OPT-07      LLM 输出无 schema 校验               可靠性
P1        OPT-08      无测试基础设施                       可维护性

P2        OPT-09      API 调用无超时                       稳定性
P2        OPT-10      Agent 清理不完整                     正确性
P2        OPT-11      MessageBus 跨请求污染                正确性
P2        OPT-12      关键 Agent 失败被吞                  决策质量
P2        OPT-13      Serverless 超时限制                  可用性
P2        OPT-14      SSE 代码重复                         可维护性
P2        OPT-15      Embedding 失败静默降级               可靠性

P3        OPT-16      OpenAI Client 重复创建               性能
P3        OPT-17      toFunctionDef() 无缓存               性能
P3        OPT-18      AgentContext 类型安全                 可维护性
P3        OPT-19      model 赋值冗余                       可维护性
P3        OPT-20      ToolExecutionResult 类型              可维护性
P3        OPT-21      cleanJSON 正则问题                   可靠性
P3        OPT-22      Supabase fallback                    可靠性

架构      OPT-23      Orchestrator/Architect 重叠          架构演进
架构      OPT-24      缺少可观测性                         运维
```

---

---

## 20. Evolution Roadmap — Technical Implementation Plan

> Based on competitive analysis (vs. CodePilot / Claude Agent SDK) and production readiness audit. See `vision.md` for strategic rationale.

### 20.1 Phase 1 — Trustworthy (能用)

#### 20.1.1 Authentication & RBAC

**Resolves:** OPT-01 (P0 CRITICAL)

**Implementation:**

```
Phase 1a: API Key Gate (Week 1)
─────────────────────────────────────────
  app/api/
  └── middleware.ts (new)        # Next.js middleware
      ├── verify Bearer token / API key
      ├── exclude: /api/health (public)
      └── reject 401 for everything else

  database/migrations/
  └── 011_auth.sql (new)
      ├── api_keys table (key_hash, user_id, scope, expires_at)
      └── audit_log table (user_id, action, resource, timestamp)

Phase 1b: RBAC (Week 2-3)
─────────────────────────────────────────
  Roles:
  ├── admin     → full access (all API endpoints)
  ├── developer → execute pipelines, view results
  └── viewer    → read-only (projects, signals, results)

  Enforcement:
  ├── middleware checks role before route handler
  ├── /api/cron/* requires Vercel Cron Secret header
  └── /api/meta, /api/*/deploy require admin or developer role
```

**Affected files:** New `app/api/middleware.ts`, all route handlers gain auth context.

---

#### 20.1.2 Human-in-the-Loop Approval Gates

**Resolves:** No existing OPT (new capability)

**Implementation:**

```
Approval Gate Architecture
─────────────────────────────────────────

  Pipeline execution
       │
       ▼
  ┌──────────────────┐
  │ Stage completes   │
  │ (e.g. Decision    │
  │  Maker → PROCEED) │
  └────────┬─────────┘
           │
    gate_config[stage].requiresApproval?
           │
     ┌─────┴─────┐
     │ Yes       │ No
     ▼           ▼
  ┌──────────┐  Continue
  │ Persist  │  pipeline
  │ checkpoint│
  │ + pause  │
  └────┬─────┘
       │
  POST /api/pipelines/{id}/approve  (new endpoint)
       │
       ▼
  Resume pipeline from checkpoint
```

**New files:**
- `lib/core/approval-gate.ts` — Gate logic + checkpoint persistence
- `app/api/pipelines/[id]/approve/route.ts` — Approval endpoint
- `database/migrations/012_approval_gates.sql` — pipeline_checkpoints table

**Configuration (per-project):**
```typescript
interface GateConfig {
  after_decision:  'auto' | 'require_approval';  // Default: require_approval
  before_deploy:   'auto' | 'require_approval';  // Default: require_approval
  before_implement:'auto' | 'require_approval';  // Default: auto
}
```

**Design principle:** Gates default to `require_approval` for destructive stages (deploy) and high-stakes stages (decision). Teams increase autonomy as trust grows.

---

#### 20.1.3 Pipeline Checkpoint & Resume

**Resolves:** OPT-13 (Serverless timeout), new recovery capability

**Implementation:**

```
Checkpoint Schema
─────────────────────────────────────────

  pipeline_runs table (new)
  ├── id: uuid
  ├── project_id: uuid
  ├── pipeline_type: 'meta' | 'traditional' | 'stage'
  ├── status: 'running' | 'paused' | 'completed' | 'failed'
  ├── current_stage: text
  ├── checkpoint_data: jsonb     # Serialized stage outputs
  ├── started_at: timestamp
  ├── updated_at: timestamp
  └── error: text (nullable)

  Checkpoint data structure:
  {
    "decision": { ... DecisionOutput },        # After DM
    "architect_trace": [ ... ],                 # Partial Architect trace
    "agent_messages": { ... },                  # Serialized agent context
    "completed_stages": ["decision"],
    "gate_status": { "after_decision": "approved" }
  }
```

**Resume flow:**
```
POST /api/pipelines/{id}/resume
  │
  ▼
Load checkpoint_data from pipeline_runs
  │
  ▼
Skip completed stages (decision already done → go to architect)
  │
  ▼
Restore agent context from serialized messages
  │
  ▼
Continue pipeline from current_stage
```

**Integration with approval gates:** When a gate pauses the pipeline, checkpoint is automatically persisted. Approval triggers resume.

---

### 20.2 Phase 2 — Usable (好用)

#### 20.2.1 Multi-Model per Agent

**Resolves:** Cost optimization (new capability)

**Implementation:**

```
Agent Config Extension
─────────────────────────────────────────

  agents/{name}/index.ts — already has `model` field in config

  Recommended model allocation:
  ┌──────────────────────┬──────────────┬──────────────┐
  │ Agent                │ Current      │ Recommended  │
  ├──────────────────────┼──────────────┼──────────────┤
  │ Architect            │ gpt-4o       │ gpt-4o       │
  │ Decision Maker       │ gpt-4o       │ gpt-4o       │
  │ Developer            │ gpt-4o       │ gpt-4o       │
  │ Tech Lead            │ gpt-4o       │ gpt-4o       │
  │ Supervisor           │ gpt-4o       │ gpt-4o-mini  │
  │ Knowledge Curator    │ gpt-4o       │ gpt-4o-mini  │
  │ Researcher           │ gpt-4o       │ gpt-4o-mini  │
  │ Blue Team            │ gpt-4o       │ gpt-4o-mini  │
  │ Critic               │ gpt-4o       │ gpt-4o       │
  │ Arbitrator           │ gpt-4o       │ gpt-4o-mini  │
  │ PM                   │ gpt-4o       │ gpt-4o-mini  │
  │ Orchestrator         │ gpt-4o       │ gpt-4o       │
  │ QA Engineer          │ gpt-4o       │ gpt-4o-mini  │
  │ Code Reviewer        │ gpt-4o       │ gpt-4o-mini  │
  │ Deployer             │ gpt-4o       │ gpt-4o-mini  │
  └──────────────────────┴──────────────┴──────────────┘

  lib/core/llm.ts changes:
  ├── Add provider abstraction interface (OpenAI / Anthropic / DeepSeek)
  ├── Provider factory: createProvider(type, config)
  └── Agent config gains optional `provider` field
```

**Estimated cost reduction:** 7 of 15 agents can use gpt-4o-mini → ~40-50% token cost savings.

---

#### 20.2.2 Execution Observability Dashboard

**Resolves:** OPT-24 (observability), token cost tracking

**Implementation:**

```
Observability Schema
─────────────────────────────────────────

  execution_traces table (new)
  ├── id: uuid
  ├── pipeline_run_id: uuid (FK)
  ├── agent_id: text
  ├── stage: text
  ├── started_at: timestamp
  ├── completed_at: timestamp
  ├── status: 'success' | 'failed' | 'timeout'
  ├── loop_count: int
  ├── token_usage: jsonb { prompt, completion, total }
  ├── tools_called: jsonb [{ name, duration_ms, success }]
  ├── error: text (nullable)
  └── cost_usd: decimal          # Calculated from model pricing

  pipeline_summaries view (new)
  ├── total_duration_ms
  ├── total_tokens
  ├── total_cost_usd
  ├── agent_count
  ├── success_rate
  └── stages_completed
```

**BaseAgent integration:**
```typescript
// lib/core/base-agent.ts — add to run() method:
// 1. Record start time + agent ID at loop entry
// 2. Accumulate usage from each LLM call (already returned by OpenAI)
// 3. Record tool call names + durations
// 4. On exit: persist trace to execution_traces table
```

**Frontend:**
- `app/(dashboard)/observability/page.tsx` — Pipeline run history
- `components/observability/PipelineTimeline.tsx` — Gantt-style agent timeline
- `components/observability/CostBreakdown.tsx` — Token/cost per agent

---

#### 20.2.3 Webhook Notifications

**Resolves:** Team integration (new capability)

**Implementation:**

```
Webhook System
─────────────────────────────────────────

  webhook_configs table (new)
  ├── id: uuid
  ├── project_id: uuid (nullable, null = global)
  ├── url: text
  ├── secret: text (HMAC signing)
  ├── events: text[]             # ['pipeline.completed', 'pr.created', 'deploy.failed']
  └── enabled: boolean

  lib/services/webhook.ts (new)
  ├── emitWebhook(event, payload)
  ├── HMAC-SHA256 signature in X-Signature header
  ├── Retry: 3 attempts with exponential backoff
  └── Timeout: 10s per attempt

  Integration points (MessageBus hooks):
  ├── pipeline_complete → webhook 'pipeline.completed'
  ├── git_create_pr tool success → webhook 'pr.created'
  ├── trigger_deploy tool success → webhook 'deploy.completed'
  ├── check_health tool failure → webhook 'deploy.failed'
  └── approval_gate paused → webhook 'approval.required'
```

**Payload format (Feishu/DingTalk compatible):**
```json
{
  "event": "pipeline.completed",
  "project_id": "...",
  "pipeline_run_id": "...",
  "status": "success",
  "summary": "Meta Pipeline completed: PROCEED → 3 tasks implemented → deployed",
  "duration_ms": 180000,
  "cost_usd": 0.42,
  "timestamp": "2026-03-06T10:00:00Z"
}
```

---

### 20.3 Phase 3 — Powerful (强大)

#### 20.3.1 Multimodal Input

**Implementation:**

```
Signal Enhancement
─────────────────────────────────────────

  signals table — add column:
  └── attachments: jsonb[]       # [{ type, url, base64?, name }]

  app/api/signals/route.ts — accept multipart/form-data
  ├── Image upload → store in Supabase Storage
  ├── Generate base64 for LLM consumption
  └── Append to signal content as image_url content blocks

  Agent integration:
  ├── Knowledge Curator: pass image context to search queries
  ├── PM: reference attached designs in PRD
  └── Researcher: use screenshots for competitor comparison
```

**Requires:** OpenAI Vision API (gpt-4o already supports it) or Anthropic Claude with Vision.

---

#### 20.3.2 Team Skill Library

**Implementation:**

```
Shared Skills
─────────────────────────────────────────

  team_skills table (new)
  ├── id: uuid
  ├── name: text (unique per team)
  ├── description: text
  ├── content: text              # SKILL.md content
  ├── author_id: uuid
  ├── version: int
  ├── tags: text[]
  ├── usage_count: int
  └── created_at: timestamp

  app/api/skills/route.ts (new)
  ├── GET    → list team skills
  ├── POST   → publish skill to team library
  ├── GET /:id → fetch skill content
  └── DELETE /:id → remove skill (admin only)

  Integration with discover_skills tool:
  └── Search team_skills table alongside local SKILL.md files
```

---

#### 20.3.3 Pipeline Templates

**Implementation:**

```
Template System
─────────────────────────────────────────

  Built-in templates:
  ├── bug-triage        → Prepare (light) + Plan
  ├── feature-eval      → Full Prepare (Blue/Red/Arbitrator)
  ├── tech-debt-review  → Knowledge Curator + Critic + Plan
  ├── quick-implement   → Skip Prepare → Plan + Implement
  └── full-pipeline     → Prepare + Plan + Implement + Deploy

  pipeline_templates table (new)
  ├── id: uuid
  ├── name: text
  ├── description: text
  ├── stage_config: jsonb        # Which stages to run, agent overrides
  ├── gate_config: jsonb         # Approval gate settings
  ├── model_overrides: jsonb     # Per-agent model overrides
  └── is_builtin: boolean

  Frontend:
  └── Template selector in pipeline trigger UI
```

---

### 20.4 Roadmap vs. Existing OPT Issues Mapping

```
Roadmap Item                    Resolves OPT    New Capability
════════════════════════════    ════════════    ══════════════
Phase 1:
  Auth & RBAC                   OPT-01 (P0)     Yes
  Human-in-the-Loop             —               Yes
  Checkpoint & Resume           OPT-13 (P2)     Yes

Phase 2:
  Multi-Model per Agent         —               Yes
  Execution Observability       OPT-24 (Arch)   Yes
  Webhook Notifications         —               Yes

Phase 3:
  Multimodal Input              —               Yes
  Team Skill Library            —               Yes
  Pipeline Templates            —               Yes

Still open (not in roadmap):
  OPT-02  Command injection     → Fix in Phase 1 alongside auth
  OPT-03  Service Role Key      → Fix in Phase 1 alongside auth
  OPT-04  Message array growth  → Already has compression (base-agent.ts)
  OPT-05  SSE heartbeat         → Fix in Phase 1 (infrastructure)
  OPT-06  Memory leak           → Fix in Phase 1 (infrastructure)
  OPT-07  Schema validation     → Fix in Phase 2 (reliability)
  OPT-08  Test infrastructure   → Ongoing (start in Phase 1)
  OPT-09~22                     → Address incrementally
```

---

*Updated: 2026-03-06 | RebuilD AI-Native Jira System — Evolution Roadmap Added*
