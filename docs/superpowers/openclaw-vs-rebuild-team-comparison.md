# OpenClaw vs RebuilD — Team/Multi-Agent 对比分析

> 生成时间：2026-03-17

## 1. 架构理念：根本性差异

| 维度 | OpenClaw | 当前项目 (RebuilD) |
|------|----------|-------------------|
| **定位** | 个人 AI 助手 Gateway，多 agent = 多"人格"路由 | AI native Jira，多 agent = 一个任务的协作团队 |
| **agent 含义** | 一个**独立的大脑**（独立 workspace、session store、auth） | 一个**子任务执行者**（共享 conversation context，由 lead agent 调度） |
| **协作目标** | 不同 agent 服务不同用户/场景，偶尔跨 agent 通信 | 多个 agent 协同完成**一个复杂任务**（如写 PRD + 写代码 + 测试） |

## 2. Agent 隔离模型

### OpenClaw — 强隔离

- 每个 agent 有独立的 `workspace/`、`agentDir/`、`sessions/`
- 独立的 auth-profiles、model 配置、sandbox 策略
- 独立的 `AGENTS.md`/`SOUL.md`/`USER.md` 人格文件
- agent 之间**默认不能通信**，需要显式开启 `tools.agentToAgent.enabled`

### RebuilD — 弱隔离，强协作

- 子 agent 由 `TaskTool` 动态创建，共享项目上下文
- 通过 `Blackboard`（PostgreSQL JSONB）共享状态
- 通过 `agent_mailbox` 表互相发消息
- 子 agent 自动继承父 agent 的部分工具集

## 3. 通信机制

### OpenClaw

```
sessions_send    → 异步发消息给另一个 agent session
sessions_spawn   → 创建新 agent session
sessions_list    → 列出活跃 sessions
sessions_history → 查看历史
```

- 本质是 **session 间的消息传递**，类似 IPC
- 无内建的任务队列、依赖管理
- 通信靠**文件系统**（shared workspace 中的 `goal.md`/`status.md`）做状态协调
- **单向异步**，缺乏"等待回复"语义（issue #10010 中提到的 gap）

### RebuilD

```
agent_mailbox    → DB 表，支持 task_assignment/message/broadcast/plan_approval_request 等类型
MateMessageQueue → 内存队列，用户→agent 的实时干预
Blackboard       → 共享键值存储（decision/artifact/question/status/constraint/feedback）
team_tasks       → DB 表，blocks/blocked_by 依赖关系
```

- **多层通信**：DB mailbox + 内存队列 + 共享黑板
- 内建**任务依赖图**（DAG）
- 支持 broadcast 广播
- 用户可以**实时干预**任何一个 agent（per-agent chat）

## 4. 编排模式

### OpenClaw — Coordinator-Specialist 模式

- 推荐一个 coordinator agent 负责分解任务，通过 `sessions_send` 委派给 specialist
- specialist **无状态**，完成即终止
- coordinator 拥有持久记忆，负责聚合结果
- specialist 被**禁止** `sessions_send`，防止递归委派

### RebuilD — Lead Agent + Team 模式

- `agent_teams` 表管理团队生命周期：`forming → active → idle → disbanded`
- lead agent 协调，但 agent 之间可以**互相通信**
- 每个 agent 有持续状态（`active/idle/working/completed/failed`）
- 支持 subagent 自动匹配（keyword scoring from `SubagentRegistry`）
- max 5 并发子 agent

## 5. 可观测性 & 用户干预

### OpenClaw

- OpenTelemetry tracing（按 agentId 打标签）
- Prometheus metrics（成功率、token 用量、run 次数）
- 无内建的实时团队可视化 UI
- 用户通过原有的 channel（WhatsApp/Telegram 等）与 agent 交互

### RebuilD — 丰富的实时 UI

- `TeamCollaborationView`：全屏团队执行视图
- `AgentLaneGrid`：2x2 网格展示每个 agent 的实时状态
- `AgentLane`：每个 agent 的步骤流、工具执行可视化、耗时追踪
- `TeamStatusBar`：团队摘要（agent 数、工作中数量、经过时间）
- `TeamInterventionInput`：用户可以 @agent 或 @all 发指令
- SSE 实时推送 `team_update` 事件到前端

## 6. 状态共享

### OpenClaw

- **文件系统**：`goal.md`/`plan.md`/`status.md`/`log.md`（append-only）
- 无内建的结构化共享状态
- 容易出现**竞态条件**（多 agent 同时写文件）

### RebuilD

- **Blackboard**（PostgreSQL）：类型化条目（decision/artifact/question/status/constraint/feedback）
- 命名规范：`{agent}.{topic}` 或 `{scope}.{id}.{field}`
- 支持 tags、版本管理
- 原子写入，无竞态问题

## 7. 关键差距对照

| 能力 | OpenClaw | RebuilD |
|------|----------|---------|
| 任务依赖图（DAG） | ❌ 无（RFC 中） | ✅ 有（`team_tasks.blocks/blocked_by`） |
| 共享状态存储 | ⚠️ 文件系统（弱） | ✅ PostgreSQL Blackboard（强） |
| 实时团队可视化 | ❌ 无 | ✅ 有（完整 UI 组件） |
| 用户实时干预 | ⚠️ 通过 channel 发消息 | ✅ Per-agent chat + broadcast |
| Agent 路由 | ✅ 强（binding 规则引擎） | ❌ 无（agent 由 lead 内部调度） |
| 多用户隔离 | ✅ 强（核心场景） | ❌ 弱（单用户项目导向） |
| Channel 集成 | ✅ 20+ 消息平台 | ❌ Web UI 单通道 |
| Agent 持久化 | ✅ 强（独立 workspace + session store） | ⚠️ 弱（子 agent 按需创建/销毁） |
| 沙箱/安全 | ✅ Docker 容器级隔离 | ❌ 无沙箱 |

## 8. 总结

**OpenClaw 的 "team"** 本质上是**多个独立 agent 的路由和偶尔通信**，设计目标是"一个 Gateway 服务多个人/多个场景"，agent 之间默认隔离，协作是附加功能（且目前还在 RFC 阶段）。

**RebuilD 的 "team agent"** 是**面向任务的紧密协作团队**，设计目标是"多个 agent 协同完成一个复杂项目任务"，天然共享上下文、有任务依赖管理、有实时可视化和用户干预能力。

简单说：OpenClaw 是 **"多个独居的 agent 偶尔打电话"**，RebuilD 是 **"一个办公室里的协作团队"**。

---

## 9. 深入讨论：OpenClaw 有没有"队长/根节点 agent"？

**没有。** 这是两个项目之间一个结构性的区别。

### OpenClaw 的 agent 拓扑：扁平对等

OpenClaw 里所有 agent 是平级的：

```
Gateway（公寓楼）
  ├── agent "alex"   ← 住 101，用自己的手机号
  ├── agent "mia"    ← 住 102，用自己的手机号
  └── agent "work"   ← 住 103，用公司手机号
```

- 没有 `lead_agent` 字段
- 没有 parent/child 关系
- 没有"谁能指挥谁"的层级
- `agents.list[].default: true` 只是**路由兜底**，不是"队长"

### "Coordinator" 是社区 hack，不是一等公民

社区推荐的 Coordinator-Specialist 模式完全靠软约束实现：

1. 在 coordinator 的 `AGENTS.md` 里写"你是协调者，用 `sessions_send` 分派任务"
2. 给 specialist **deny** 掉 `sessions_send`，防止反向委派
3. 在 shared workspace 里用 `status.md` 文件人肉追踪状态

本质上是 **prompt engineering + tool deny list**，没有任何运行时机制保证这个拓扑。

### 对比 RebuilD

RebuilD 的 `agent_teams.lead_agent` + `TaskTool` 构成了**运行时强制的层级关系**：
- lead agent 是唯一能 spawn 子 agent 的节点
- 子 agent 被 `BLOCKED_SUB_TOOLS` 禁止再 spawn（`task` 在黑名单里）
- 团队生命周期由 DB 状态机管理（`forming → active → disbanded`）

### 结论

OpenClaw 全员平级，因为它是"多个一人公司共享一个服务器"。公司级产品需要根节点概念，因为公司场景天然是层级化的：任务进来 → 有人拆解 → 有人执行 → 有人汇总。这不是 prompt 能 hack 出来的，需要系统层面的保证。

---

## 10. 混合架构设想：Root Agent + OpenClaw 式 Mate

### 核心思路

用户提出：如果 team mate 按照 OpenClaw 的模式做（独立 workspace/memory/persona），只是在最上游包一层控制的根 agent（由租户/mission 控制）？

### 架构图

```
租户 Mission
    │
    ▼
┌─────────────────────────────────┐
│  Root Agent（控制层）              │
│  - 任务拆解 / 分派 / 汇总         │
│  - 生命周期管理                    │
│  - 权限 / 预算控制                 │
└──┬──────────┬──────────┬────────┘
   │          │          │
   ▼          ▼          ▼
┌──────┐  ┌──────┐  ┌──────┐
│ Mate │  │ Mate │  │ Mate │    ← 每个都是 OpenClaw 式的独立 agent
│独立   │  │独立   │  │独立   │    - 独立 workspace
│workspace│ session│ memory│    - 独立 session store
│ tools │  │ model │  │persona│   - 独立 tools/model/persona
└──────┘  └──────┘  └──────┘
```

本质上是 **Kubernetes 模型**：pod 各自独立运行，但上面有 controller 编排。

### 这个设计解决了什么

当前 RebuilD 的子 agent 是临时工——`TaskTool` 创建，任务完成即销毁，无记忆、无积累。

| 当前 subagent | OpenClaw 式 mate |
|---|---|
| 临时进程，用完即弃 | 持久实体，跨任务存活 |
| 共享父 agent 上下文 | 独立 workspace + memory |
| 工具集由父 agent 裁剪 | 自带完整工具集和 persona |
| 无专业积累 | 可以越做越专（MEMORY.md 积累领域知识） |
| 轻量、快 | 重、但能力天花板高 |

典型场景：公司有个"安全审计 mate"，它做过 50 次代码审查后，自己的 workspace 里积累了公司的安全规范、常见漏洞模式、历史审计结论。下次新任务来，root agent 只需要说"审一下这个 PR"，它自己就知道该看什么。

### 需要解决的硬问题

**1. Root 和 Mate 之间的通信语义**

OpenClaw 的 `sessions_send` 是异步发完就走。需要的是带回调的异步任务协议：
```
root → mate:  "做这件事"（task_assignment）
mate → root:  "做完了，结果是..."（task_result）
root:          等待 / 超时 / 重试
```

**2. Mate 的生命周期管理**

mate 是持久的，就有成本问题：空闲 mate 要不要保持 session？多久没用应该 hibernate？tenant 能有多少个 mate？

**3. Root Agent 瓶颈**

所有任务经过 root，可能需要分级 root（Tech Lead Agent / PM Agent / QA Lead Agent）。

**4. 共享状态**

OpenClaw 式隔离意味着 mate 之间看不到彼此的 workspace。需要保留 Blackboard 作为跨 mate 的共享层。

### 设计方向结论

不是照搬 OpenClaw 的 agent 模型，而是取其核心洞察：

> **Mate 应该是有状态、有记忆、可复用的持久实体，而不是一次性的 subprocess。**

目标架构 = OpenClaw 的 agent 隔离模型 + RebuilD 的 root 控制层 + RebuilD 的 Blackboard + 新增的 mate 生命周期管理。

---

## 11. 架构修正：包工头模型（取代固定 Root Agent）

> 讨论纪要：固定的 root agent 层级过于僵硬。OpenClaw 的平权理念在更大项目中能力会得到更大拓展，不会遗失。更像是——**包工头接项目（chat/mission 明确）组队干活的过程**。

### 核心修正

层级不是系统架构固定的，而是**由 mission 动态产生**的：

```
包工头模型：

Tenant 拥有一个 mate 池（全部平级）:
  - pm, backend-dev, frontend-dev, security-auditor, qa-tester, dba, infra ...

Mission: "做用户认证系统"
  → PM mate 接单当包工头
  → 拉上 backend-dev, frontend-dev, security-auditor
  → 干完，散伙

Mission: "修性能问题"
  → backend-dev mate 接单当包工头
  → 拉上 DBA mate, infra mate
  → 干完，散伙
```

- mate 之间**本质平级**（OpenClaw 理念保留）
- "谁是 lead" 由本次 mission 决定，不是系统架构决定
- 比固定 root 层灵活得多——任何 mate 可以根据领域适配性担任 lead

### 与固定 Root 模型的对比

| | 固定 Root Agent | 包工头模型 |
|---|---|---|
| 层级来源 | 系统架构 | Mission 上下文 |
| Lead 角色 | 永远是同一个 agent | 按 mission 领域动态选择 |
| 灵活性 | 低（root 成为瓶颈） | 高（任何 mate 可 lead） |
| 扩展性 | root 是单点 | 天然分布式 |
| 与 OpenClaw 的关系 | 在平权之上强加层级 | 保留平权，层级是临时角色 |

---

## 12. 两个关键设计问题的结论

### 问题 1：Mission-scoped Blackboard — 确认正确

Blackboard 需要三层 scope：

```
┌─────────────────────────────────────────────┐
│ Tenant Blackboard                           │
│  公司级知识：安全规范、代码风格、架构决策        │
│  所有 mate 可读，管理员可写                    │
├─────────────────────────────────────────────┤
│ Mission Blackboard                          │
│  本次任务的共享状态：PRD、设计决策、进度         │
│  本次团队成员可读写，mission 结束后归档          │
├─────────────────────────────────────────────┤
│ Mate Private Workspace                      │
│  个人笔记、中间草稿、领域积累                   │
│  仅 mate 自己可读写                            │
└─────────────────────────────────────────────┘
```

Key 命名规范：
```
tenant::security-policy           ← 租户级，持久
mission::auth-feature::prd        ← 任务级，任务结束归档
mate::security-auditor::findings  ← 个人级，跟着 mate 走
```

包工头的特殊权限：创建 mission blackboard、邀请 mate、归档。但不能碰其他 mate 的 private workspace。

### 问题 2：Always-on Mate — 确认需要

按需唤醒的 mate 覆盖短任务场景，但**长程业务一定需要 always-on mate**。

两种 mate 运行模式共存：

| | 按需唤醒 Mate | Always-on Mate |
|---|---|---|
| 场景 | 短任务（审代码、写文档） | 长程业务（运维值班、持续监控、CI/CD 守护） |
| 生命周期 | idle → active → idle → hibernate | 持续 active，仅在维护时暂停 |
| 成本模型 | 按任务计费 | 按时间计费（需要预算上限） |
| 记忆 | 任务间断续，靠 memory retrieval 恢复 | 连续 context，实时感知 |
| 典型角色 | code-reviewer, doc-writer | ops-watch, security-sentinel, pipeline-guardian |

---

## 13. Mate 持久化模型：与 Vault 资产体系的融合

> 背景：项目已有完整的 Vault 资产治理系统（Obsidian 式知识图谱），资产类型包括 skill、tool、doc、pptx、code。Mate 的持久化不应该另起炉灶，而应融入已有的资产体系。

### 核心洞察

**Mate 的"记忆"不是聊天记录——是它生产和消费过的资产。**

一个 security-auditor mate 做过 50 次审计后，它的"专业性"体现在：
- 它**生产**过的资产：50 份审计报告（vault artifact: doc）
- 它**消费**过的资产：公司安全规范（vault artifact: doc）、审计工具（vault artifact: tool）
- 它**积累**的模式识别：常见漏洞模式、误报模式（mate_memory: insight/pattern）
- 这些资产之间的**关系图**：报告 → depends_on → 规范；工具 → produced → 报告

### Vault 已有的能力（可直接复用）

| Vault 能力 | 对 Mate 持久化的意义 |
|---|---|
| `vault_artifacts` 表（类型、版本、status lifecycle） | Mate 产出物的注册和版本管理 |
| `graph.json`（produced/depends_on/reuses/supersedes 边） | Mate 的知识图谱——它参与了哪些资产的生产链 |
| `embedding` 列（256-dim 向量） | Mate 唤醒时的语义检索——找到与当前任务最相关的历史资产 |
| `reuse_count` | Mate 的高频资产识别——哪些经验被反复使用 |
| `status` lifecycle（draft→published→deprecated→superseded） | Mate 经验的新陈代谢——旧经验被新经验 supersede |

### 需要扩展的部分

现有 Vault 缺少的是**"谁生产的"和"在哪个 mission 中生产的"** 的精确追踪：

```sql
-- vault_artifacts 已有字段
created_by_agent TEXT    -- 当前只记录 'rebuild'

-- 需要扩展
created_by_mate  TEXT,   -- 哪个 mate 生产的
mission_id       UUID,   -- 在哪个 mission 中生产的
consumed_by      TEXT[], -- 被哪些 mate 消费过
```

这样 mate 的"记忆"就变成了对 vault 的一次**图查询**：

```
给我 security-auditor 在最近 10 个 mission 中 produced 的所有 artifact，
按 reuse_count 降序，取 embedding 与当前任务最相似的 top-5。
```

### Mate 持久化 = Vault 图上的一个节点

```
              Vault Knowledge Graph

 [安全规范 v2]──depends_on──►[审计报告 #47]
       │                        │
   consumed_by              produced_by
       │                        │
       ▼                        ▼
 ┌──────────────────────────────────┐
 │  Mate: security-auditor          │
 │  persona: PERSONA.md             │
 │  tools: [sonarqube, semgrep]     │
 │  model: opus                     │
 │  produced: 50 artifacts          │
 │  consumed: 12 artifacts          │
 │  insights: 23 patterns           │
 └──────────────────────────────────┘
       │                        │
   consumed_by              produced_by
       │                        │
       ▼                        ▼
 [漏洞模式库]◄──reuses──[审计报告 #48]
```

Mate 本身也是 vault 中的一种 artifact（type: `agent`），有自己的版本、status、graph edges。

---

## 14. Mate 记忆的完整三层模型

> 结论：Vault 是长期记忆，但短期工作记忆也是必需的。本地部署场景下 SQLite + sqlite-vec 可替代 PostgreSQL 实现等效能力。

### 三层架构

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Vault（长期资产记忆）                                 │
│                                                             │
│  存储：PostgreSQL / SQLite（本地部署）                         │
│  内容：artifact（skill/tool/doc/code/agent）、知识图谱、        │
│        经验 pattern、graph edges、embedding                   │
│  生命周期：永久，跨 mission，可版本化 / supersede               │
│  访问：所有 mate 可查询（按权限），产出物自动注册                  │
│                                                             │
│  Mate 唤醒时：                                               │
│    用当前任务 embedding 检索 vault → top-K 相关资产注入 prompt  │
│  Mission 结束时：                                             │
│    短期记忆精华 → 提炼为 artifact 沉淀进 vault                  │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: 短期工作记忆（Mission 级）                             │
│                                                             │
│  存储：SQLite / 内存                                          │
│  内容：当前进度（"PR 看到第 3 个文件"）、中间结论草稿、            │
│        待验证假设、临时笔记                                    │
│  生命周期：单个 mission 期间存活                                │
│  用途：                                                      │
│    - 断点恢复：mate 被中断后，靠此层恢复工作进度                  │
│    - 上下文压缩：context window 满时，旧内容压缩到此层            │
│    - 跨步骤延续：ReAct 循环中保持 step 间的连续性                │
│  Mission 结束时：                                             │
│    精华 → 提炼进 Vault                                        │
│    草稿 → 丢弃                                                │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Context Window（即时记忆）                            │
│                                                             │
│  存储：LLM 内存                                               │
│  内容：当前对话、system prompt（含 persona + vault 检索结果       │
│        + 短期工作记忆摘要）                                    │
│  生命周期：单次 LLM 调用                                       │
│  用途：mate 的"当下意识"——它此刻看到和思考的一切                  │
└─────────────────────────────────────────────────────────────┘
```

### 三层之间的数据流

```
Mission 开始（mate 被唤醒）：
  Vault ──检索──► Context Window
                    ↑
  短期工作记忆 ──摘要──┘  （如果是断点恢复）

Mission 执行中：
  Context Window ──溢出压缩──► 短期工作记忆
  Context Window ──产出 artifact──► Vault（实时注册）

Mission 结束（mate 休眠）：
  短期工作记忆 ──提炼精华──► Vault
  短期工作记忆 ──丢弃草稿──► /dev/null
  Context Window ──释放──► 停止计费
```

### 短期工作记忆的存储设计

```sql
CREATE TABLE mate_working_memory (
  id          TEXT PRIMARY KEY,
  mate_id     TEXT NOT NULL,
  mission_id  UUID NOT NULL,
  entry_type  TEXT NOT NULL,   -- 'progress' | 'draft' | 'hypothesis' | 'note'
  content     TEXT NOT NULL,
  step_number INT,             -- 关联到 ReAct 的第几步
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

- `progress`：进度快照（"已扫描 auth/, api/ 待扫描"）
- `draft`：中间结论草稿（"初步判断 JWT 配置有问题，待确认"）
- `hypothesis`：待验证假设（"怀疑性能瓶颈在 N+1 查询"）
- `note`：自由笔记

### 本地部署方案

| 组件 | 云端 | 本地 |
|---|---|---|
| Vault 存储 | PostgreSQL + pgvector | SQLite + sqlite-vec |
| 短期工作记忆 | PostgreSQL | SQLite（同一个 .db 文件） |
| 向量检索 | pgvector (ivfflat) | sqlite-vec (brute-force, 小规模够用) |
| 知识图谱 | graph.json + DB edges | 同上 |

SQLite 单文件、零配置、跨平台，完全满足本地/单机部署需求。数据量大了再迁 PostgreSQL。

### 与 Obsidian 的类比

| Obsidian | Mate 记忆体系 |
|---|---|
| Markdown 文件 | Vault artifact |
| 双向链接 `[[]]` | Graph edges (produced/depends_on/reuses) |
| Tag 系统 | artifact tags[] |
| 本地优先 | SQLite 本地存储 |
| 插件系统 | Mate tools |
| Daily Note | 短期工作记忆（mission 级） |
| MOC (Map of Content) | Vault graph visualization |

---

## 15. 入口设计：Chat 优先 + Mission 升级 + 第三方接入

### 设计决策

- **包工头选择**：用户指定 + 轻量 dispatcher 结合（用户可 @mate 指定 lead，否则 dispatcher 按规则自动匹配）
- **前端交互**：保留 Chat 为主入口，复杂场景自动升级为 Mission（而非另建 Dashboard）

### 三条入口路径

```
入口 1：Chat（主入口，覆盖 80% 场景）
  ├── 简单问题 → 单 agent 直答（现有行为不变）
  ├── context 压缩到临界值 → 自动升级为 Mission（拓展协作空间）
  └── 检测到复杂需求 → 自动升级为 Mission（团队协作）

入口 2：企微 / 飞书等第三方平台
  └── 任务直接进来 → dispatcher 路由 → 自动创建 Mission

入口 3：Mission Dashboard（查看/干预正在执行的 Mission）
  └── 不是独立入口，而是 Chat 升级后的展开视图
```

### Chat → Mission 升级的三个触发条件

**触发 1：Context 压缩临界值**

单 agent 会话的 context window 压缩到阈值时，说明任务复杂度已超出单 agent 能力。
系统自动提议："这个任务比较复杂，建议升级为团队协作模式，我来组队？"

```
用户 chat → 单 agent 处理
  → context 使用率 > 80%
  → agent 判断剩余任务量仍然很大
  → 触发升级提议
  → 用户确认 → 创建 Mission，当前 agent 成为包工头或移交给更合适的 mate
```

**触发 2：复杂需求检测**

Dispatcher（轻量规则层，不是 agent）分析用户输入，判断是否需要团队：

```
规则示例：
- 涉及 ≥3 个领域（前端+后端+安全） → 团队级
- 明确的多阶段交付（PRD → 设计 → 开发 → 测试） → 团队级
- 用户显式说"帮我组个团队" / "这个项目需要..." → 团队级
- 预估 token 消耗 > 单 agent 预算上限 → 团队级
```

**触发 3：第三方平台任务**

从企微/飞书进来的任务天然是"有人发了个活"，直接走 Mission 流程：

```
飞书消息 → OpenClaw 式 channel adapter → dispatcher
  → 简单问题（@bot 问个事） → 单 agent 回复到飞书
  → 复杂任务（审批流/项目需求） → 创建 Mission → 进度回传飞书
```

### Dispatcher 设计（轻量路由层）

Dispatcher **不是** agent，是一个规则引擎 + 简单分类器：

```typescript
interface Dispatcher {
  // 判断是否需要升级为 Mission
  shouldEscalate(input: UserInput, context: SessionContext): EscalationDecision;

  // 选择包工头（用户未指定时）
  selectLead(mission: MissionDraft, matePool: Mate[]): Mate;

  // 第三方平台路由
  routeExternal(source: ChannelMessage): SingleAgent | MissionDraft;
}

interface EscalationDecision {
  escalate: boolean;
  reason: 'context_threshold' | 'complexity_detected' | 'user_requested' | 'external_task';
  suggestedLead?: string;   // 建议的包工头 mate
  suggestedTeam?: string[]; // 建议的团队成员
}
```

selectLead 的匹配逻辑（复用现有 SubagentRegistry 的 keyword scoring 思路）：
1. 解析 mission 的领域标签（security / frontend / backend / infra / pm ...）
2. 匹配 mate pool 中 persona 最符合的 mate
3. 优先选择该领域 vault artifact 产出最多的 mate（经验最丰富）
4. 用户 @override 时跳过以上逻辑

### 使用链变化

```
Before（当前）：
  用户 → ChatInput → route.ts → chat-engine → single agent → response

After（新模型）：
  用户 → ChatInput → dispatcher.shouldEscalate()
    ├── false → chat-engine → single agent → response（不变）
    └── true  → MissionEngine
                  → dispatcher.selectLead()
                  → lead mate 组队
                  → TeamCollaborationView 展开
                  → mate 并行执行
                  → lead mate 汇总 → response
```

### 前端交互的渐进升级

```
阶段 1：普通 Chat
  ┌─────────────────────────────┐
  │ 对话消息流                    │
  │ ...                         │
  │ [输入框]                     │
  └─────────────────────────────┘

阶段 2：系统提议升级
  ┌─────────────────────────────┐
  │ 对话消息流                    │
  │ ...                         │
  │ ┌───────────────────────┐   │
  │ │ 🔄 建议升级为团队模式    │   │
  │ │ 推荐包工头：PM mate     │   │
  │ │ 建议团队：backend, fe   │   │
  │ │ [确认组队] [继续单聊]    │   │
  │ └───────────────────────┘   │
  │ [输入框]                     │
  └─────────────────────────────┘

阶段 3：Mission 执行中（现有 TeamCollaborationView 复用）
  ┌─────────────────────────────┐
  │ Chat 区（缩小）    15vh      │
  ├─────────────────────────────┤
  │ TeamCollaborationView       │
  │ ┌──────┐ ┌──────┐          │
  │ │PM    │ │BE dev│          │
  │ │lead  │ │      │          │
  │ └──────┘ └──────┘          │
  │ ┌──────┐ ┌──────┐          │
  │ │FE dev│ │QA    │          │
  │ │      │ │      │          │
  │ └──────┘ └──────┘          │
  │ [@PM / @all 干预输入框]      │
  └─────────────────────────────┘
```

现有的 `TeamCollaborationView`、`AgentLaneGrid`、`TeamInterventionInput` 等组件可以直接复用，只需要在 Chat 层加一个升级触发逻辑。

---

## 16. 前端统一入口：Chat 即门户 + Graph 即全景

### 核心认知

**所有用户行为本质上都是 Chat。** 无论用户在 Web 界面、企微、微信、Telegram 上发任务，行为本身都是"发一条消息"。这意味着：

- Chat 是唯一入口，不需要 Mission Dashboard 作为独立页面
- Mission/项目不是另一个模块，而是 Chat 的**衍生物**
- 项目的全景视图用 **Graph** 呈现，不是传统列表

### Graph 作为项目视图（替代传统项目列表）

不做 Jira 式的看板或列表，而是把 Vault 的知识图谱提升为一等公民：

```
Graph 视图（全景）：

    [PM mate]──lead──►[Mission: 用户认证]──produced──►[PRD v2]
        │                    │                          │
        │                collaborated                depends_on
        │                    │                          │
        ▼                    ▼                          ▼
  [BE mate]──produced──►[auth-service]         [安全规范 v3]
        │                    │                          │
        │                    │                     consumed_by
        │                    │                          │
        ▼                    ▼                          ▼
  [Security mate]──produced──►[审计报告 #12]◄──reuses──[漏洞模式库]
```

### 三种节点、三种钻入

| 节点类型 | 点击展开 | 数据来源 |
|---|---|---|
| **Mate 节点** | 参与过的所有 mission、产出物清单、专业领域、活跃状态 | `vault_artifacts.created_by_mate` + mate 定义 |
| **Mission 节点** | 团队组成、执行过程回放、产出物、token 消耗、源 Chat 链接 | `vault_artifacts.mission_id` + mission blackboard |
| **Artifact 节点** | 谁产出的、哪个 mission、被谁复用、版本历史、内容预览 | `vault_artifacts` 全字段 + graph edges |

### Graph 天然回答的管理问题

```
"我们的 agent 团队都干了什么？"      → 全景图一目了然
"安全审计 mate 值不值这个钱？"       → 看节点连接密度 + reuse_count
"这个项目的完整交付链路？"           → 从 mission 节点展开
"哪些 mate 经常一起协作？"           → mate 间的 co-mission 边
"哪个 artifact 被复用最多？"         → 节点大小 = reuse_count
"从一个想法到交付经历了什么？"        → Chat → Mission → Artifacts 的完整路径
```

### 数据基础

现有 `vault_artifacts` 表 + graph edges 已经提供了 80% 的数据。只需补充：

```sql
-- vault_artifacts 扩展（§13 已提出）
created_by_mate  TEXT,    -- 哪个 mate 生产的
mission_id       UUID,    -- 在哪个 mission 中生产的
consumed_by      TEXT[],  -- 被哪些 mate 消费过

-- 新增 mission 表
CREATE TABLE missions (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  source_chat   UUID,             -- 源自哪个 chat（Chat 即门户）
  lead_mate     TEXT NOT NULL,     -- 本次包工头
  team_mates    TEXT[] NOT NULL,   -- 团队成员
  status        TEXT NOT NULL,     -- 'forming' | 'active' | 'completed' | 'archived'
  title         TEXT,
  description   TEXT,
  token_budget  INT,
  tokens_used   INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  archived_at   TIMESTAMPTZ
);
```

### 前端布局

```
┌──────────────────────────────────────────────────────┐
│  侧边栏                │  主区域                       │
│                        │                              │
│  [会话列表]             │  点击会话 → 聊天界面           │
│    ├── 普通对话 💬      │    （简单问答 / Mission 执行）  │
│    ├── Mission 对话 🚀  │                              │
│    └── ...             │  点击 Graph 🔗 → 全景图       │
│                        │    （Mate / Mission / Artifact │
│  ──────────────        │     三种节点、交互式探索）       │
│  [Graph 入口 🔗]       │                              │
│                        │                              │
└──────────────────────────────────────────────────────┘
```

- 侧边栏会话列表中，Mission 对话有特殊标识（区别于普通 chat）
- Graph 入口在侧边栏底部，点开后是全屏交互式图谱
- 从 Graph 的任何节点可以跳转回对应的 Chat（源头）或 Mission 执行视图

### 使用链统一

```
所有入口最终都是 Chat：

Web 聊天框     ──► Chat ──► dispatcher ──► single agent / Mission
企微消息       ──► Chat ──► dispatcher ──► single agent / Mission
飞书消息       ──► Chat ──► dispatcher ──► single agent / Mission
Telegram 消息  ──► Chat ──► dispatcher ──► single agent / Mission

所有产出最终都进 Vault：

single agent 产出  ──► vault_artifacts ──► Graph
Mission 团队产出   ──► vault_artifacts ──► Graph

Graph 是所有工作的"结果视图"，Chat 是所有工作的"过程入口"。
```

### 与旧 Signals 模块的关系

Signals 模块（外部信息采集 → 分析 → 转化为项目）在新模型下不再需要独立页面。
它的能力可以重构为：

- **信号采集** → 变成一种 always-on mate 的职责（如 `signal-collector mate`）
- **信号分析** → 该 mate 在自己的 workspace 中完成，结论写入 vault
- **转化为项目** → mate 判断值得执行时，通过 Chat 向用户提议创建 Mission
- **审批流** → 用户在 Chat 中确认/驳回

信号不再是一个独立的"收件箱"，而是 mate 主动汇报的"我发现了一个机会"。

---

## 17. Mate 间通信协议：OpenClaw 的实际模型

### OpenClaw 的两种通信工具

| 工具 | 拓扑 | 阻塞 | 用户可见性 |
|---|---|---|---|
| `sessions_send` | 网状（任意 agent → 任意 agent） | 可选同步等待（timeout）或异步 | 用户看不到，除非 agent 主动 announce |
| `sessions_spawn` | 父子（spawn 链） | 非阻塞，立即返回 | **自动 announce 回发起者的 channel** |

### 关键机制：sessions_spawn 的自动回报

`sessions_spawn` 的核心设计：子 agent 完成后**自动把结果推回到用户所在的 channel**：

```
用户在企微发任务
  → coordinator agent 收到
  → sessions_spawn 派给 specialist
  → specialist 干完
  → 自动 announce 回用户的企微对话

用户看到的：
  ✅ Sub-agent completed: Review auth PR
  Status: ok
  Result: Found 2 security issues in jwt.ts...
  ⏱ 45s · 12k tokens
```

用户不需要看 Dashboard，结果**直接推回发任务的 channel**。

### OpenClaw 的实际通信拓扑：网状 + 自动回报

不是星形（全部经过包工头），也不是纯网状（没人管）：

```
                    sessions_send（按需，网状）
                 ┌──────────────────────────┐
                 │                          │
[Lead mate] ◄───┤    [BE mate]  ◄────►  [Security mate]
    │            │
    │ sessions_spawn（父子，自动回报）
    │            │
    ▼            ▼
 用户 channel ◄── announce 自动推送结果
```

- **任务分派**：lead 用 spawn（结果自动回来）
- **协作沟通**：mate 间用 send（按需直接通信，最多 5 轮乒乓）
- **用户通知**：spawn 的 announce 机制自动推回 channel

### OpenClaw 的已知问题（我们需要规避的）

从 GitHub issues 看到的实际问题：

| Issue | 问题 | 启示 |
|---|---|---|
| #23315 | spawn 完成通知不工作 | announce 机制不可靠，需要有备用通知链路 |
| #18150 | announce 消息无限重放 | announce 和 session 生命周期耦合过紧 |
| #25800 | ANNOUNCE_SKIP 不生效 | announce 控制粒度不够 |
| #12350 | 子 agent 被中断时不发 announce | 异常路径没有覆盖 |
| #18237 | 长程任务无法异步回传结果 | spawn 只支持"做完一次性回传"，不支持中间进度 |

### 我们的通信协议设计

吸取 OpenClaw 的优点（网状 + 自动回报），规避其缺点（announce 不可靠、无中间进度）：

```
┌─────────────────────────────────────────────────────────┐
│  通信层次                                                │
├──────────┬──────────────────────────────────────────────┤
│ 任务分派  │ lead → mate: spawn 任务（非阻塞）              │
│          │ mate → lead: 完成后自动回报（类似 announce）    │
│          │ + 中间进度推送（OpenClaw 没有的）               │
├──────────┼──────────────────────────────────────────────┤
│ 协作沟通  │ mate ↔ mate: 通过 Mission Blackboard 共享状态 │
│          │ + 定向消息（agent_mailbox）用于具体协作          │
│          │ lead 通过读 blackboard 保持全局感知             │
├──────────┼──────────────────────────────────────────────┤
│ 用户通知  │ 结果自动推回源 channel（announce）              │
│          │ + 中间进度可选推送（"已完成 3/5 个子任务"）       │
│          │ + 异常/卡住时主动上报用户                       │
├──────────┼──────────────────────────────────────────────┤
│ 用户干预  │ 用户 → 任意 mate: per-agent chat（现有能力）   │
│          │ 用户 → all: broadcast（现有能力）               │
└──────────┴──────────────────────────────────────────────┘
```

与 OpenClaw 的差异：

| | OpenClaw | RebuilD |
|---|---|---|
| 中间进度 | 无（只有最终 announce） | 有（mate 写 blackboard，lead 汇总推送） |
| 异常通知 | spawn 中断时不通知 | mate 异常时自动上报 lead + 用户 |
| 协作状态共享 | 文件系统（竞态） | Blackboard DB（原子写入） |
| 通知可靠性 | announce 有 bug | DB 事件 + SSE 双链路保障 |

---

## 18. Mission 完整生命周期

### 七个阶段

```
 ① Inception     ② Formation     ③ Planning      ④ Execution
 Chat 中触发  →  选包工头/组队  →  任务拆解/DAG  →  并行执行
     │               │               │               │
     │               │               │               │
     ▼               ▼               ▼               ▼
 ⑤ Review       ⑥ Delivery      ⑦ Archival
 质量检查     →  交付/回报用户  →  沉淀进 Vault
```

### ① Inception（孵化）

**触发方式**（§15 已定义的三种）：
- context 压缩到临界值
- dispatcher 检测到复杂需求
- 第三方平台任务进入

**产出**：`MissionDraft`

```typescript
interface MissionDraft {
  source_chat: UUID;           // 源 chat
  source_channel: string;      // 'web' | 'wecom' | 'feishu' | 'telegram'
  title: string;               // dispatcher 或用户给的标题
  description: string;         // 原始需求
  suggested_lead?: string;     // 用户 @指定 或 dispatcher 推荐
  complexity_signals: string[]; // 为什么需要升级为 mission
}
```

**状态**：Mission 表插入，status = `inception`

### ② Formation（组队）

**由包工头执行**（如果用户没指定 lead，dispatcher 先选出 lead）：

```
Lead mate 被唤醒
  → 读取 MissionDraft
  → 分析需要哪些领域的 mate
  → 从 mate pool 中选择团队成员
  → 检查 mate 可用性（idle? 是否在其他 mission 中?）
  → 向用户确认团队阵容（在 Chat 中）
  → 用户确认 / 调整
```

**产出**：
- Mission Blackboard 创建
- team_mates 字段填充
- 各 mate 状态从 idle → active

**状态**：Mission status = `forming` → `active`

### ③ Planning（规划）

**包工头在 Mission Blackboard 上制定计划**：

```
Lead mate:
  → 将需求拆解为子任务
  → 建立任务依赖（DAG）
  → 分配任务给具体 mate
  → 写入 mission blackboard:
      mission::{id}::plan       ← 整体计划
      mission::{id}::task-dag   ← 任务依赖图
      mission::{id}::assignments ← 分工表
```

**用户确认**（可选，取决于任务重要程度）：
- 高重要度：计划推回 Chat 让用户审批
- 低重要度：lead 自行决定，用户可随时在 Chat 查看

**产出**：任务 DAG + 分工

### ④ Execution（执行）

**并行执行，核心循环**：

```
每个 mate 的执行循环：
  1. 从 blackboard 读取自己的任务
  2. 检查依赖是否满足（blocked_by 是否都 completed）
  3. 执行任务（ReAct loop）
  4. 每步将进度写入短期工作记忆
  5. 关键结论写入 Mission Blackboard
  6. 需要协作时 → 写 blackboard 或发 mailbox 给其他 mate
  7. 产出 artifact → 实时注册到 Vault
  8. 任务完成 → 通知 lead（announce）
  9. lead 更新 DAG 进度，检查是否有新任务可以开始
```

**中间进度推送**（OpenClaw 不具备的）：

```
Lead mate 定期汇总 → 推送到用户 channel：
  "Mission 进度：3/7 任务完成
   ✅ PRD 编写（PM mate）
   ✅ API 设计（BE mate）
   ✅ 安全评审（Security mate）
   🔄 前端开发（FE mate）— 进行中
   ⏳ 后端开发（BE mate）— 等待 API 设计完成
   ⏳ 集成测试（QA mate）— 等待前后端
   ⏳ 部署（Infra mate）— 等待测试"
```

**异常处理**：

| 异常 | 处理 |
|---|---|
| Mate 超时 | Lead 重新分配或唤醒备用 mate |
| Mate 卡住 | 短期工作记忆中的 hypothesis 为空 > N 步 → lead 介入 |
| Token 预算耗尽 | Lead 向用户申请追加，或降级策略（换便宜模型） |
| Mate 报告阻塞 | Lead 调整 DAG，重新排序或引入新 mate |
| 用户干预 | 通过 per-agent chat 直接指导，或 broadcast 全员 |

### ⑤ Review（评审）

**所有子任务完成后，lead mate 做质量检查**：

```
Lead mate:
  → 读取所有 mate 的产出物
  → 对照原始需求检查完整性
  → 必要时调用 QA mate 做专项检查
  → 发现问题 → 打回给对应 mate 修改（回到 ④）
  → 全部通过 → 进入交付
```

**写入 blackboard**：
```
mission::{id}::review-result   ← 评审结论
mission::{id}::quality-score   ← 质量评分
```

### ⑥ Delivery（交付）

**向用户交付结果**：

```
Lead mate 汇总所有产出物 → 推回用户 channel：

  "✅ Mission 完成：用户认证系统

   交付物：
   📄 PRD v2（vault: artifact-xxx）
   💻 auth-service 代码（PR #142）
   🔒 安全审计报告（vault: artifact-yyy）
   ✅ 测试报告：47/47 通过

   团队：PM(lead) + BE + FE + Security + QA
   耗时：xxx tokens

   所有产出物已注册到 Vault，可在 Graph 中查看完整链路。"
```

**用户验收**：
- 用户在 Chat 中确认接受 → Mission 进入 Archival
- 用户有修改意见 → 回到 ④ 或 ⑤

### ⑦ Archival（归档沉淀）

**Mission 结束后的三件事**：

```
1. 短期工作记忆 → 精华提炼进 Vault
   每个 mate 的 working memory：
     progress → 丢弃
     draft → 丢弃
     hypothesis（已验证的）→ 提炼为 vault artifact (type: insight)
     note（有价值的）→ 提炼为 vault artifact (type: doc)

2. Mission Blackboard → 归档
   mission::{id}::* → 标记为 archived
   关键决策点保留为 vault artifact (type: decision)

3. Graph edges 生成
   mission 节点 → produced → 所有产出 artifact
   各 mate 节点 → collaborated → mission 节点
   artifact 间 → depends_on / reuses 边
```

**Mission 状态**：`active` → `completed` → `archived`

**mate 状态**：`active` → `idle`（等待下一个 mission）或 `hibernated`（长期无任务）

### 完整状态机

```
Mission:
  inception → forming → active → completed → archived
                ↑          │
                └── failed ─┘  (lead 判断无法完成 → 向用户汇报原因)

Mate (在 mission 中):
  idle → active → completed
           │         │
           ↓         ↓
        blocked    failed
           │
           ↓
        active (依赖解除后恢复)
```

### 数据留痕：从 Chat 到 Vault 的完整链路

```
用户发一条消息（Chat）
  → 产生 Mission（missions 表）
    → 产生任务 DAG（mission blackboard）
      → 各 mate 产出 artifacts（vault_artifacts 表）
        → artifacts 之间的关系（graph edges）
          → 用户在 Graph 中看到完整链路

任何时候从 Graph 点击 mission 节点：
  → 可以看到源 Chat（source_chat）
  → 可以看到团队组成（team_mates）
  → 可以看到每个 mate 的执行过程（短期工作记忆快照，如果保留）
  → 可以看到所有产出物（vault artifacts）
  → 可以看到 token 消耗和时间线
```

---

## 19. 走查：缺失模块清单

> 2026-03-17 完整走查 §1-§18 后识别的缺口。

### 缺失 1：Mate 注册与定义规范

文档讨论了 mate 的 persona、tools、model 偏好，但**没有定义 mate 怎么创建、注册、版本化**。

需要明确：

```
mates/                              ← Mate 定义目录（类似现有 .agents/）
  security-auditor/
    PERSONA.md                      ← 人格定义（角色、专长、行为约束）
    tools.json                      ← 工具白名单/黑名单
    model.json                      ← 模型偏好（主模型 + fallback）
    wake-prompt.md                  ← 唤醒时注入的 system prompt 模板
    auth-profiles/                  ← 专属凭证（如 SonarQube token）
```

关键问题：
- Mate 定义是管理员手工创建，还是系统可以自动从 mission 经验中"孵化"新 mate？
- Mate 定义本身应该是 vault artifact（type: `agent`），这样 mate 的演进也有版本历史
- 现有 `SubagentRegistry`（`.agents/*.md`）需要升级为 `MateRegistry`，支持持久化身份

### 缺失 2：多租户 Mate Pool 管理

online-claw-p0 设计了多租户，但本文档未涉及：

- 每个 tenant 有自己的 mate pool？还是有平台级共享 mate？
- Mate 是 tenant 独占还是可以跨 tenant 复用（如"平台安全审计 mate"）？
- Tenant 创建/删除 mate 的权限边界
- Mate 数量上限（per tenant quota）

```
可能的模型：
  Platform Mates（平台级，所有 tenant 可调用，只读）
    └── 通用 code-reviewer, doc-writer ...
  Tenant Mates（租户级，tenant 管理员创建/管理）
    └── 定制化的领域专家 mate
```

### 缺失 3：安全与权限模型

文档提到了 Blackboard 三层 scope 和包工头的特殊权限，但**没有系统化的权限模型**：

- **Mate 工具权限**：哪些 mate 可以用哪些 tool（OpenClaw 有 per-agent tools.allow/deny）
- **Blackboard 访问控制**：tenant 级谁可写？mission 级的读写权限怎么在组队时授予/回收？
- **Vault 写入权限**：哪些 mate 可以注册 artifact？是否需要审批？
- **沙箱隔离**：mate 执行代码时的沙箱策略（OpenClaw 有 Docker 级隔离）
- **敏感操作审批**：删除 artifact、修改 tenant blackboard 等危险操作是否需要人工确认

### 缺失 4：成本控制与计费

token_budget 在 mission 表和多处提及，但缺少完整的成本框架：

```
成本控制层次：
  Tenant 级  → 月度总预算上限
  Mission 级 → 单次 mission 预算（包工头分配）
  Mate 级    → 单 mate 在单 mission 中的用量上限

需要的机制：
  - 预算预扣（mission 创建时预留额度）
  - 实时用量追踪（per mate per mission）
  - 超额预警（80% 时通知包工头 → 90% 时通知用户）
  - 降级策略（预算紧张时自动切换到更便宜的模型）
  - 成本归因报告（Graph 中每个节点可以看到 token 消耗）
```

### 缺失 5：并发与资源冲突

一个 mate 可以同时参与多个 mission 吗？文档未明确：

| 策略 | 优点 | 缺点 |
|---|---|---|
| **单 mission 独占** | 简单，无冲突 | mate pool 需要足够大，否则排队 |
| **多 mission 并发** | 资源利用率高 | 需要 context 隔离，短期工作记忆按 mission 分区 |
| **混合：按需唤醒可并发，always-on 独占** | 平衡 | 复杂度适中 |

如果允许并发，`mate_working_memory` 已经按 `mission_id` 分区，可以支持。但 mate 的 context window 是共享的——一个 mate 不可能同时在两个 LLM session 中思考。实际上是**时间片轮转**：mate 在 mission A 的任务间隙被 mission B 唤醒。

### 缺失 6：迁移路径（从当前架构到新架构）

文档描述了目标架构，但没有说明**怎么从现有 RebuilD 迁移过去**：

```
阶段 0（当前状态）：
  - 单 core agent + TaskTool 临时 subagent
  - agent_teams / agent_mailbox / blackboard 已有 DB 表
  - TeamCollaborationView 已有前端组件
  - Vault 已有 10 条命令 + vault_artifacts 表
  - SubagentRegistry 已有 keyword matching

阶段 1（最小可行）：
  - SubagentRegistry → MateRegistry（加持久化身份）
  - TaskTool subagent → 可复用的 mate（加 workspace 隔离）
  - vault_artifacts 扩展 created_by_mate + mission_id
  - missions 表创建
  - 复用现有 TeamCollaborationView

阶段 2（核心能力）：
  - Dispatcher 实现（Chat → Mission 升级）
  - Blackboard 三层 scope
  - 短期工作记忆表
  - Mate 唤醒/休眠协议
  - announce 机制（结果回报）

阶段 3（完整体验）：
  - Graph 全景视图
  - 第三方 channel adapter（企微/飞书）
  - 多租户 mate pool
  - 成本控制框架
  - Always-on mate 支持
```

### 缺失模块优先级

| 优先级 | 模块 | 原因 |
|---|---|---|
| **P0** | §迁移路径 | 不知道怎么走到目标就无法开始 |
| **P0** | §Mate 注册与定义 | 一切的基础——没有 mate 定义就没有包工头模型 |
| **P1** | §安全与权限 | 公司级产品必须有，但可以先用简化版 |
| **P1** | §并发与资源冲突 | 影响 mate pool 的设计决策 |
| **P2** | §成本控制 | 重要但可以后加 |
| **P2** | §多租户 Mate Pool | 取决于多租户的时间节点 |

---

## 20. [P0] Mate 注册与定义规范

### 现状分析：两套互不相通的系统

当前代码中存在**两套 agent 调度系统**，互不相通：

| | SubagentRegistry（task tool） | Team Mode（chat-engine） |
|---|---|---|
| 触发 | 显式 `task` tool call | 自动触发（75% context 阈值） |
| 定义来源 | `.agents/*.md` 文件 | 动态生成（from state summary） |
| 匹配 | keyword scoring | N/A（lead 定义角色） |
| 生命周期 | 一次性，用完销毁 | 并行长程，团队级 |
| DB 记录 | 无 | `agent_teams` 表 |
| 通信 | 无（fire-and-forget） | per-mate message queue |
| UI | 基础 start/complete 事件 | 完整 streaming + per-mate tokens |

**核心问题**：SubagentRegistry 的 mate 没有持久身份，Team Mode 的 mate 没有可复用的定义。

### 目标：MateRegistry 统一两套系统

```
MateRegistry（统一注册中心）
    │
    ├── 被 TaskTool 调用（短任务，单 mate）
    ├── 被 MissionEngine 调用（复杂任务，组队）
    └── 被 Dispatcher 调用（选包工头）
```

### Mate 定义格式

沿用现有 `.md` frontmatter 格式，扩展字段：

```markdown
---
name: security-auditor
description: 安全审计专家，专注 OWASP Top 10、代码漏洞扫描、依赖审计
tools: read, glob, grep, web_search, exec, write
denied_tools: task, create_agent, persist_agent
model: inherit
can_lead: true                    # 是否可以担任包工头
domains: [security, audit, compliance]  # 领域标签（用于 dispatcher 匹配）
run_mode: on_demand               # on_demand | always_on
---

你是一名资深安全审计专家。

## 核心能力
- OWASP Top 10 漏洞识别
- 依赖供应链安全审查
- JWT/OAuth/Session 安全评估

## 工作规范
- 每次审计产出结构化报告（写入 vault）
- 关键发现立即写入 mission blackboard
- 高危漏洞直接通知包工头
```

### 新增字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `denied_tools` | string[] | 明确禁止的工具（补充 BLOCKED_SUB_TOOLS） |
| `can_lead` | boolean | 是否有资格被选为包工头（默认 false） |
| `domains` | string[] | 领域标签，替代纯 keyword matching |
| `run_mode` | enum | `on_demand`（按需唤醒）或 `always_on`（长程守护） |

### 存储：文件 + DB 双写

```
文件系统（定义源）：             DB（运行时状态 + Vault 注册）：
  mates/                         mate_definitions 表
    security-auditor/               ← name, description, domains, can_lead
      MATE.md                       ← 系统 prompt
      tools.json (可选)             ← tools allow/deny
      model.json (可选)             ← 模型偏好
                                 vault_artifacts (type: 'agent')
                                    ← 版本化，可 supersede
```

### DB Schema

```sql
CREATE TABLE mate_definitions (
  id            TEXT PRIMARY KEY,     -- 'security-auditor'
  tenant_id     UUID,                 -- NULL = 平台级
  description   TEXT NOT NULL,
  domains       TEXT[] DEFAULT '{}',
  tools_allow   TEXT[] DEFAULT '{}',
  tools_deny    TEXT[] DEFAULT '{}',
  model         TEXT DEFAULT 'inherit',
  can_lead      BOOLEAN DEFAULT false,
  run_mode      TEXT DEFAULT 'on_demand'
                  CHECK (run_mode IN ('on_demand', 'always_on')),
  system_prompt TEXT NOT NULL,

  -- 运行时状态
  status        TEXT DEFAULT 'idle'
                  CHECK (status IN ('idle', 'active', 'hibernated', 'disabled')),
  current_mission UUID,
  last_active   TIMESTAMPTZ,

  -- Vault 关联
  vault_artifact_id TEXT,            -- 指向 vault_artifacts 表（type: 'agent'）
  version       INT DEFAULT 1,

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mate_definitions_domains ON mate_definitions USING GIN (domains);
CREATE INDEX idx_mate_definitions_status ON mate_definitions (status);
```

### MateRegistry 接口

```typescript
interface MateRegistry {
  // 注册/更新（从文件系统加载 或 API 创建）
  register(definition: MateDefinition): Promise<void>;
  update(mateId: string, patch: Partial<MateDefinition>): Promise<void>;

  // 查询
  get(mateId: string): Promise<MateDefinition | null>;
  list(filter?: { status?: string; domain?: string; canLead?: boolean }): Promise<MateDefinition[]>;

  // 匹配（替代现有 keyword scoring）
  matchForTask(taskDescription: string): Promise<MateDefinition | null>;
  matchForLead(missionDraft: MissionDraft): Promise<MateDefinition | null>;

  // 生命周期
  activate(mateId: string, missionId: UUID): Promise<void>;
  deactivate(mateId: string): Promise<void>;
  hibernate(mateId: string): Promise<void>;

  // Vault 集成
  registerAsArtifact(mateId: string): Promise<string>;  // 返回 vault artifact id
  getVersion(mateId: string): Promise<number>;
}
```

### 匹配算法升级

现有 keyword scoring 替换为**三级匹配**：

```
Level 1: 精确指定
  用户 @security-auditor → 直接返回

Level 2: 领域匹配（新增）
  从 mission/task 提取领域标签 → 匹配 mate_definitions.domains
  命中多个时，按 vault 中该 mate 的 artifact 产出数排序（经验优先）

Level 3: 语义匹配（降级兜底）
  task description embedding vs mate description embedding
  复用 vault 的 256-dim embedding 基础设施
```

### 与现有代码的关系

```
现有代码                          →  新代码
─────────────────────────────────────────────────
SubagentRegistry                  →  MateRegistry（superset）
  .agents/*.md                    →  mates/*/MATE.md
  SubagentDefinition              →  MateDefinition（扩展）
  getSubagentRegistry()           →  getMateRegistry()
  bestMatch(description)          →  matchForTask() / matchForLead()

TaskTool                          →  TaskTool（调用 MateRegistry）
  spawn fresh BaseAgent           →  唤醒已注册 mate + 注入记忆

Team Mode (chat-engine)           →  MissionEngine（调用 MateRegistry）
  动态生成 mate from summary      →  从 MateRegistry 选择 + 组队
  agent_teams 表                  →  missions 表 + mate_definitions 表
```

---

## 21. [P0] 迁移路径：详细分阶段计划

### 阶段 0：现状盘点（无代码变更）

**可以直接复用的组件**：

| 组件 | 当前位置 | 复用方式 |
|---|---|---|
| `agent_teams` 表 | schema.sql:164 | 演进为 `missions` 表 |
| `team_tasks` 表 | schema.sql:193 | 保留，关联到 mission |
| `agent_mailbox` 表 | schema.sql:176 | 保留，team_id 改为 mission_id |
| `vault_artifacts` 表 | migration 042/057/058 | 扩展字段 |
| `TeamCollaborationView` | components/chat/team/ | 直接复用 |
| `AgentLaneGrid` + `AgentLane` | components/chat/team/ | 直接复用 |
| `TeamInterventionInput` | components/chat/team/ | 直接复用 |
| `MateMessageQueue` | lib/services/mate-message-queue.ts | 直接复用 |
| `SubagentRegistry` | lib/tools/subagent-registry.ts | 升级为 MateRegistry |
| `TaskTool` | lib/tools/task.ts | 改为调用 MateRegistry |
| Team Mode (chat-engine) | lib/services/chat-engine.ts:906-1039 | 重构为 MissionEngine |
| `BaseAgent` | lib/core/base-agent.ts | 不变，mate 仍然是 BaseAgent 实例 |
| Vault tools | lib/tools/vault.ts | 扩展 mate/mission 字段 |

**需要新建的组件**：

| 组件 | 说明 |
|---|---|
| `mate_definitions` 表 | Mate 持久化注册 |
| `missions` 表 | 替代 agent_teams（增加 source_chat, token_budget 等） |
| `mate_working_memory` 表 | 短期工作记忆 |
| `MateRegistry` 类 | 统一注册中心 |
| `MissionEngine` 类 | Mission 生命周期管理 |
| `Dispatcher` 类 | 路由 + 升级判断 |

### 阶段 1：Mate 注册 + Mission 表（最小可行变更）

**目标**：让现有的 team mode 和 task tool 共享同一套 mate 定义。

**Step 1.1：DB 迁移**

```
新增：
  - 063_create_mate_definitions.sql     ← mate_definitions 表
  - 064_create_missions.sql             ← missions 表
  - 065_extend_vault_for_mate.sql       ← vault_artifacts 加 created_by_mate, mission_id
  - 066_create_mate_working_memory.sql  ← mate_working_memory 表
```

**Step 1.2：MateRegistry 实现**

```
新增：
  lib/services/mate-registry.ts
    - 从 mates/*/MATE.md 加载定义（兼容旧 .agents/*.md 和 subagents/*/agent.md）
    - 写入 mate_definitions 表
    - 三级匹配算法（精确 → 领域 → 语义）
    - 注册 mate 为 vault artifact
```

**Step 1.3：TaskTool 改造**

```
修改：
  lib/tools/task.ts
    - getSubagentRegistry() → getMateRegistry()
    - spawn 时：从 mate_definitions 读取定义（而非仅从文件）
    - spawn 时：注入 vault 检索结果到 system prompt（mate 的历史经验）
    - 完成时：artifact 写入 vault 时标记 created_by_mate
```

**Step 1.4：兼容层**

```
修改：
  lib/tools/subagent-registry.ts
    - 标记为 @deprecated
    - 内部代理到 MateRegistry
    - 现有 .agents/*.md 自动迁移到 mates/ 目录格式
```

**验证标准**：
- 现有 task tool 功能不变
- mate 定义持久化到 DB
- vault artifacts 带 created_by_mate 字段
- 可以通过 DB 查询某个 mate 的历史产出

### 阶段 2：Mission 生命周期 + Dispatcher

**目标**：Chat → Mission 升级链路打通。

**Step 2.1：MissionEngine**

```
新增：
  lib/services/mission-engine.ts
    - 从 chat-engine.ts 的 team mode 代码（906-1039 行）抽取
    - 实现 §18 的七阶段生命周期
    - 调用 MateRegistry 组队
    - 调用 MateMessageQueue 做通信
    - Mission Blackboard scope 管理
```

**Step 2.2：Dispatcher**

```
新增：
  lib/services/dispatcher.ts
    - shouldEscalate()：规则引擎判断是否升级
    - selectLead()：从 MateRegistry 中选包工头（can_lead + domain match）
    - 集成到 chat-engine 的消息处理链路
```

**Step 2.3：Chat-Engine 重构**

```
修改：
  lib/services/chat-engine.ts
    - 现有 team upgrade 逻辑（[[TEAM_UPGRADE]] marker）改为调用 Dispatcher
    - 新增 Dispatcher.shouldEscalate() 判断点
    - Mission 创建/管理委托给 MissionEngine
    - 保留 SSE streaming 到前端（team_update 事件不变）
```

**Step 2.4：Blackboard 三层 Scope**

```
修改：
  现有 blackboard 实现（假设已有 shared-blackboard skill）
    - key 命名规范：tenant:: / mission:: / mate::
    - 写入时校验 scope 权限
    - mission 归档时归档 mission:: 前缀的所有条目
```

**Step 2.5：Mate 唤醒/休眠协议**

```
新增：
  lib/services/mate-lifecycle.ts
    - wake(mateId, missionId)：
        1. 加载 MATE.md persona
        2. vault 语义检索历史经验 → 注入 system prompt
        3. 读取 mate_working_memory（如果是断点恢复）
        4. 创建 BaseAgent 实例
    - hibernate(mateId)：
        1. 提炼 working memory 精华 → vault artifact
        2. 清理 working memory 草稿
        3. 释放 BaseAgent 实例
        4. 更新 mate_definitions.status = 'hibernated'
```

**验证标准**：
- Chat 中输入复杂需求 → 系统自动提议升级为 Mission
- 用户确认 → 包工头选出 → 团队组建 → 并行执行
- 执行过程在 TeamCollaborationView 中实时可见
- Mission 完成后 artifact 进入 vault，带 mate 和 mission 标记

### 阶段 3：Graph + Channel + 完整体验

**Step 3.1：Graph 全景视图**

```
新增：
  components/graph/KnowledgeGraph.tsx
    - 三种节点（Mate / Mission / Artifact）
    - 交互式探索（点击钻入）
    - 数据源：vault_artifacts + missions + mate_definitions
    - 渲染：D3.js / react-force-graph
  app/(dashboard)/graph/page.tsx
    - Graph 页面路由
```

**Step 3.2：Channel Adapter**

```
新增：
  lib/channels/
    base-adapter.ts        ← Channel 适配器接口
    wecom-adapter.ts       ← 企微
    feishu-adapter.ts      ← 飞书
    telegram-adapter.ts    ← Telegram

  接口：
    receive(message) → 标准化 ChatMessage
    send(channel, message) → 推送到第三方平台
    announce(channel, missionResult) → Mission 结果回报
```

**Step 3.3：成本控制**

```
新增：
  lib/services/budget-manager.ts
    - 预算预扣 / 实时追踪 / 超额预警
    - 集成到 MissionEngine 和 BaseAgent
```

**Step 3.4：Always-on Mate**

```
新增：
  lib/services/mate-daemon.ts
    - 管理 always-on mate 的持续运行
    - 定期 heartbeat / 健康检查
    - 自动重启 / 降级
```

### 文件变更总览

```
阶段 1（约 6 个文件）：
  新增  database/migrations/063-066   (4 files)
  新增  lib/services/mate-registry.ts
  修改  lib/tools/task.ts
  废弃  lib/tools/subagent-registry.ts (保留兼容)

阶段 2（约 8 个文件）：
  新增  lib/services/mission-engine.ts
  新增  lib/services/dispatcher.ts
  新增  lib/services/mate-lifecycle.ts
  修改  lib/services/chat-engine.ts
  修改  lib/tools/vault.ts
  修改  blackboard 实现
  修改  store/slices/chatSlice.ts (mission 状态)
  修改  components/chat/ChatView.tsx (升级触发 UI)

阶段 3（约 10+ 个文件）：
  新增  components/graph/*
  新增  app/(dashboard)/graph/page.tsx
  新增  lib/channels/*
  新增  lib/services/budget-manager.ts
  新增  lib/services/mate-daemon.ts
  修改  侧边栏组件（Graph 入口）
```

### 阶段间的依赖关系

```
阶段 1 ──► 阶段 2 ──► 阶段 3
  │           │           │
  │           │           ├── Graph（依赖 vault + mission 数据）
  │           │           ├── Channel（依赖 Dispatcher + announce）
  │           │           └── Budget / Always-on（独立，可并行）
  │           │
  │           ├── MissionEngine（依赖 MateRegistry）
  │           ├── Dispatcher（依赖 MateRegistry）
  │           └── Lifecycle（依赖 MateRegistry + Vault）
  │
  ├── MateRegistry（基础，无外部依赖）
  ├── DB migrations（基础）
  └── TaskTool 改造（依赖 MateRegistry）
```

---

## 22. MateRegistry 统一两套系统的代码级分析

### 现状：两条互不相通的代码路径

**路径 A：TaskTool（短任务委派）**

```
task.ts:155   → getSubagentRegistry([wsRoot])        ← 文件扫描，进程级单例
task.ts:176   → registry.matchByDescription(task)     ← keyword scoring, threshold >= 2
task.ts:187   → new BaseAgent({ systemPrompt })       ← 从 .md 文件读取
task.ts:203   → agent.run(prompt)                     ← 非 streaming，fire-and-forget
task.ts:220   → activeSubAgents--                     ← 无 DB 记录，无持久化
```

特点：文件驱动、keyword matching、无 DB、无 streaming、用完即弃

**路径 B：Team Mode（context 溢出升级）**

```
chat-engine.ts:905  → supabase.from('agent_teams').insert()   ← DB 记录
chat-engine.ts:917  → extractTeammatesFromSummary()           ← LLM 动态编造角色
chat-engine.ts:958  → createRebuilDAgent({ systemPrompt })    ← 硬编码模板
chat-engine.ts:1004 → agent.runStreaming(task, { onToken })   ← streaming + 用户干预
chat-engine.ts:1033 → mateMessageQueue.clear(teamId)          ← 有通信能力
```

特点：动态生成、无 registry、有 DB、有 streaming、有用户干预

**两条路径的核心矛盾**：

| | 路径 A 有 | 路径 B 缺 |
|---|---|---|
| 注册中心 | ✅ SubagentRegistry | ❌ LLM 临时编角色 |
| 可复用定义 | ✅ .agents/*.md | ❌ 每次重新生成 |
| 匹配算法 | ✅ keyword scoring | ❌ 无 |

| | 路径 B 有 | 路径 A 缺 |
|---|---|---|
| DB 记录 | ✅ agent_teams | ❌ 无 |
| Streaming | ✅ onToken / onToolCall | ❌ 无 |
| 用户干预 | ✅ MateMessageQueue | ❌ 无 |
| 团队协作 | ✅ 并行 + 汇总 | ❌ fire-and-forget |

### 统一后：MateRegistry 作为单一源

```
MateRegistry（DB + 文件双源）
  │
  ├──► TaskTool 调用（小活：不存过程，结果进 vault）
  │
  └──► MissionEngine 调用（大项目：存过程 + 结果进 vault）
```

**agent 创建统一为同一个工厂**：

```typescript
// 统一的 mate agent 构建函数
function buildMateAgent(mate: MateDefinition, context: {
  missionId?: UUID;           // 有 = Mission 模式，无 = 小活模式
  workspace?: string;
  vaultExperience?: string;   // vault 检索注入的历史经验
  missionContext?: string;    // mission blackboard 注入（仅 Mission 模式）
}): BaseAgent {
  const systemPrompt = [
    mate.system_prompt,
    context.vaultExperience && `\n## 你的历史经验\n${context.vaultExperience}`,
    context.missionContext && `\n## 当前任务上下文\n${context.missionContext}`,
  ].filter(Boolean).join('\n');

  return new BaseAgent({
    name: mate.id,
    systemPrompt,
    tools: resolveTools(mate.tools_allow, mate.tools_deny),
    model: mate.model === 'inherit' ? undefined : mate.model,
  });
}
```

**两条路径调用同一个 registry，行为按需分化**：

```typescript
// 小活（TaskTool）
const mate = await mateRegistry.matchForTask(taskDescription);
const agent = buildMateAgent(mate, { vaultExperience });
const result = await agent.run(task);              // 非 streaming
vault.register({ created_by_mate: mate.id });      // 结果留痕
// 过程不存，mate 状态不变

// 大项目（MissionEngine）
const lead = await mateRegistry.matchForLead(missionDraft);
const team = await mateRegistry.list({ domains });
await mateRegistry.activate(lead.id, missionId);   // 状态变更
for (const mate of team) {
  await mateRegistry.activate(mate.id, missionId);
  const agent = buildMateAgent(mate, { missionId, vaultExperience, missionContext });
  agent.runStreaming(task, { onToken, onUserMessageCheck }); // streaming
}
// 过程存短期工作记忆，结果进 vault，mission 关联完整
```

### 核心统一收益

**Team Mode 不再需要 `extractTeammatesFromSummary()`**：

```typescript
// Before: LLM 自由发挥，每次角色名都不一样
const teammates = await this.extractTeammatesFromSummary(stateSummary);
// → [{name: "Backend Developer", role: "..."}, ...]
// 下次再也找不到这个"人"

// After: 从注册中心选，持久身份
const lead = await mateRegistry.matchForLead(missionDraft);
const team = lead.proposeTeam(missionDraft, mateRegistry);
// → [mateRegistry.get('backend-dev'), mateRegistry.get('security-auditor')]
// 同一个人，有记忆，有档案
```

### 小活 vs 大项目的留痕差异

| | 小活（TaskTool） | 大项目（Mission） |
|---|---|---|
| **过程数据** | 不存 | 存（mate_working_memory） |
| **产出物** | 进 vault，标记 created_by_mate | 进 vault，标记 created_by_mate + mission_id |
| **mate 参与记录** | 不记录 | 记录到 missions.team_mates |
| **blackboard** | 不创建 | 创建 mission scope |
| **graph edges** | 仅 mate → produced → artifact | 完整（mission + collaborated + produced） |
| **mate 状态变更** | 不变（始终 idle） | idle → active → idle |

核心原则：**产出物永远留痕，过程按需留痕。** 小活的 vault artifact 仍然带 `created_by_mate`，mate 的经验积累不会因为"这次是小活"而丢失。

---

## 23. DAG 调度器 + 拟人化 Mate 间通信

### 问题：现有并行执行无依赖管理

现有 team mode（`chat-engine.ts:960-1036`）的执行方式：

```typescript
// 所有 mate 同时启动，互不等待
const agentPromises = teammates.map(async (teammate) => { ... });
const results = await Promise.all(agentPromises);
```

真实协作场景有大量前后依赖：

```
PRD 编写 ──→ 前端开发 ──┐
     │                   ├──→ 集成测试 → 部署
     └──→ 后端开发 ──────┘
           └──→ 安全审计（可与前端并行）
```

QA 不能在前后端都没做完的时候就开始测试。

### 解决方案：DAG 调度器 + 拟人化 handoff

执行模型从 `Promise.all` 变为 **事件驱动的 DAG 推进器**：

```typescript
class MissionScheduler {
  private dag: TaskDAG;           // 任务依赖图
  private running: Map<string, RunningMate>;  // taskId → 正在运行的 mate
  private missionId: string;

  async execute(): Promise<MissionResult> {
    while (this.dag.hasUnfinished()) {
      // 1. 找出所有依赖已满足、还没启动的任务
      const ready = this.dag.getReadyTasks();

      // 2. 为每个就绪任务唤醒 mate 并启动
      for (const task of ready) {
        if (this.running.has(task.id)) continue;  // 已在跑
        const mate = await this.awakeMate(task);
        this.launchMate(mate, task);
      }

      // 3. 等待任意一个 mate 完成
      const completed = await this.waitForAnyCompletion();

      // 4. 更新 DAG + 发送拟人化 handoff 消息
      this.dag.markCompleted(completed.taskId);
      await this.sendHandoffMessages(completed);

      // 5. 推送进度给用户
      await this.reportProgress();
    }
  }
}
```

### 拟人化 handoff：mate 之间像人一样交接

当前端 mate 完成任务后，不是机械地解锁后续任务，而是 **向后续 mate 发送一条自然语言交接消息**：

```
┌─────────────────────────────────────────────┐
│ QA Mate 的对话流                             │
│                                              │
│ [System] 你的任务：对用户管理模块做集成测试   │
│ [System] 等待前置任务完成...                  │
│                                              │
│ ──── 前端任务完成，收到交接消息 ────          │
│                                              │
│ [From 前端-小王]                             │
│ 我这边用户管理模块的前端做完了，主要改动：    │
│ - 新增 /users 路由，含列表/详情/编辑三个页面  │
│ - 使用了 React Hook Form 做表单校验          │
│ - API 调用封装在 lib/api/users.ts            │
│ 你看下有没有问题，重点关注一下表单校验逻辑。  │
│                                              │
│ [From 后端-老李]                             │
│ 用户管理 API 搞定了：                        │
│ - CRUD 四个端点：GET/POST/PUT/DELETE /api/users│
│ - 加了分页和搜索，参数格式在 API.md 里       │
│ - 密码字段做了 bcrypt 加密                    │
│ 麻烦重点测下并发创建和边界值。                │
│                                              │
│ [QA Mate 开始工作...]                        │
│ 好的，我先看下前后端的改动...                 │
└─────────────────────────────────────────────┘
```

### 实现机制：复用现有 MateMessageQueue

现有基础设施已经支撑了 80%：

```
现有链路（用户 → mate）：
  用户在 UI 发消息
    → mateMessageQueue.enqueue(teamId, mateName, message)
    → mate 在 ReAct 步间 onUserMessageCheck() 读取
    → 注入为 [User Feedback]: ...

新增链路（mate → mate）：
  前置 mate 完成任务
    → MissionScheduler 生成 handoff 消息
    → mateMessageQueue.enqueue(missionId, targetMateName, message)
    → 后续 mate 在 ReAct 步间 onUserMessageCheck() 读取
    → 注入为 [From {mateName}]: ...
```

关键改动：`onUserMessageCheck` 现在可能返回两种消息，需要区分来源。

### MateMessageQueue 扩展

```typescript
interface MateMessage {
  from: 'user' | string;          // 'user' 或 mate 名称
  content: string;
  type: 'feedback' | 'handoff' | 'broadcast';  // 用户反馈 / 任务交接 / 全员广播
  artifacts?: string[];           // 关联的产出物 ID（handoff 时）
  taskId?: string;                // 完成的任务 ID
}

class MateMessageQueueService {
  private queues = new Map<string, MateMessage[]>();

  /** 用户消息（保持兼容） */
  enqueueFromUser(missionId: string, mateName: string, content: string): void {
    this.enqueue(missionId, mateName, {
      from: 'user', content, type: 'feedback',
    });
  }

  /** Mate 间交接消息 */
  enqueueHandoff(missionId: string, targetMate: string, fromMate: string, payload: {
    content: string;
    artifacts?: string[];
    taskId: string;
  }): void {
    this.enqueue(missionId, targetMate, {
      from: fromMate,
      content: payload.content,
      type: 'handoff',
      artifacts: payload.artifacts,
      taskId: payload.taskId,
    });
  }

  /** 全员广播（lead 发通知） */
  broadcast(missionId: string, fromMate: string, content: string): void {
    for (const key of this.queues.keys()) {
      if (key.startsWith(`${missionId}::`)) {
        const mateName = key.split('::')[1];
        if (mateName !== fromMate) {
          this.enqueue(missionId, mateName, {
            from: fromMate, content, type: 'broadcast',
          });
        }
      }
    }
  }
}
```

### Handoff 消息生成

交接消息不是 MissionScheduler 硬编码的模板，而是 **让前置 mate 自己总结**：

```typescript
// 前置 mate 完成任务后，MissionScheduler 要求它生成 handoff 摘要
async function generateHandoffMessage(
  completedMate: BaseAgent,
  taskResult: any,
  nextTasks: TaskNode[],     // 被解锁的后续任务
): Promise<string> {
  // 在 mate 的最后一步，追加一个总结请求
  const handoff = await completedMate.runOnce(
    `你的任务已完成。以下同事即将接手后续工作：
${nextTasks.map(t => `- ${t.assignee}：${t.description}`).join('\n')}

请用第一人称、口语化的方式，给他们写一段交接说明：
1. 你做了什么（关键改动）
2. 他们需要重点关注什么
3. 有没有遗留问题或风险点

控制在 200 字以内。`
  );
  return handoff;
}
```

这样每个 mate 的交接消息是**自己写的**，风格自然，内容精准——因为它最清楚自己做了什么。

### BaseAgent 注入格式区分

```typescript
// base-agent.ts 中的 onUserMessageCheck 返回值处理
if (context.onUserMessageCheck) {
  const msg = await context.onUserMessageCheck();
  if (msg) {
    // 解析消息类型
    const parsed: MateMessage = JSON.parse(msg);

    if (parsed.type === 'feedback') {
      messages.push({ role: 'user', content: `[用户反馈]: ${parsed.content}` });
    } else if (parsed.type === 'handoff') {
      messages.push({ role: 'user', content: `[来自 ${parsed.from} 的交接]: ${parsed.content}` });
    } else if (parsed.type === 'broadcast') {
      messages.push({ role: 'user', content: `[团队广播 from ${parsed.from}]: ${parsed.content}` });
    }
  }
}
```

### 前端 UI 呈现

在 TeamCollaborationView 的 AgentLane 中，交接消息显示为带头像的聊天气泡：

```
┌──────────── QA Mate Lane ────────────┐
│                                      │
│  ⏳ 等待前置任务...                   │
│                                      │
│  ┌─ 👨‍💻 前端-小王 ──────────────┐    │
│  │ 我这边做完了，主要改动...     │    │
│  └────────────────────────────┘    │
│                                      │
│  ┌─ 👨‍🔧 后端-老李 ──────────────┐    │
│  │ API 搞定了，重点测下并发...   │    │
│  └────────────────────────────┘    │
│                                      │
│  🔄 正在执行: 读取 API 文档...        │
│  🔄 正在执行: 编写测试用例...         │
└──────────────────────────────────────┘
```

SSE 事件类型新增 `mate_handoff`：

```typescript
channel.push({
  type: 'mate_handoff',
  data: {
    mission_id: missionId,
    from_mate: 'frontend-dev',
    to_mate: 'qa-engineer',
    content: '我这边用户管理模块的前端做完了...',
    task_id: completedTaskId,
    artifacts: ['vault://artifact-uuid'],
  },
});
```

### 三种消息流总结

| 消息流 | 方向 | 触发时机 | 注入格式 | UI 呈现 |
|--------|------|----------|----------|---------|
| 用户反馈 | 用户 → mate | 用户在 mate lane 输入 | `[用户反馈]: ...` | 用户头像气泡 |
| 任务交接 | mate → mate | 前置任务完成，DAG 解锁 | `[来自 {name} 的交接]: ...` | mate 头像气泡 |
| 团队广播 | lead → 全员 | 计划变更 / 紧急通知 | `[团队广播 from {lead}]: ...` | 系统通知样式 |

三种消息共用同一个 MateMessageQueue，通过 `MateMessage.type` 区分。BaseAgent 不需要改核心逻辑，只是 `onUserMessageCheck` 返回的内容格式变了。
