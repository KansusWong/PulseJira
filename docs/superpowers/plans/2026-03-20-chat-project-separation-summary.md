# Chat/Project 分离 — 全量实施总结与验证清单

## 概述

基于 `docs/superpowers/specs/2026-03-19-chat-project-separation-design.md` 设计方案，分 6 个阶段完成了 Chat 与 Project 的完整分离。共 23 个 commit，涉及前端组件、API 路由、数据库 Schema、Zustand Store、i18n 等层面。

---

## 一、各阶段实施摘要

### Phase 1：数据层 + 转化 API（6 commits）

| Commit | 变更 |
|--------|------|
| `9d3f646` | DB: `projects` 表新增 `execution_mode` 列 (`'foreman' \| 'team'`) |
| `dbcb29d` | Types: `Project` / `CreateProjectInput` 接口添加 `execution_mode` |
| `ac24b08` | Service: `project-service.ts` 的 create/update 支持 `execution_mode` |
| `5112af7` | Types: `ChatEventType` 新增 `project_upgrade_suggested` |
| `4c1423c` | Store: `chatSlice` 新增 `projectUpgradePanel` 状态 |
| `2d2e8cb` | API: 新建 `POST /api/conversations/[id]/convert-to-project` |

**涉及的关键文件：**
- `database/migrations/046_add_project_execution_mode.sql`
- `lib/core/types.ts`
- `projects/types.ts`、`projects/project-service.ts`
- `store/slices/chatSlice.ts`
- `app/api/conversations/[id]/convert-to-project/route.ts`（新建）

---

### Phase 2：路由分离（4 commits）

| Commit | 变更 |
|--------|------|
| `49ce743` | ChatView 新增 `projectId` prop，支持项目内嵌模式 |
| `66aad4e` | `/api/chat` 支持 `project_id` 传参，conversation 创建时关联项目 |
| `81d787f` | 项目页 `projects/[projectId]/page.tsx` 重写，内嵌 ChatView 不再跳转 |
| `55c52e9` | 项目模式空状态、隐藏 TopBar、SSE 中同步 project_id |

**涉及的关键文件：**
- `components/chat/ChatView.tsx`
- `app/api/chat/route.ts`（或 chat handler）
- `app/(dashboard)/projects/[projectId]/page.tsx`

---

### Phase 3：升级触发（1 commit）

| Commit | 变更 |
|--------|------|
| `b59e0c3` | `[[PROJECT_UPGRADE]]` marker 解析、ProjectUpgradeCard 组件、SSE 事件串联 |

**涉及的关键文件：**
- `lib/services/chat-engine.ts` — Structured Marker 扩展
- `components/chat/ProjectUpgradeCard.tsx`（新建）
- `components/chat/ChatView.tsx` — `project_upgrade_suggested` 事件处理

---

### Phase 4：侧栏（5 commits）

| Commit | 变更 |
|--------|------|
| `8bf62f6` | 侧栏过滤 `status = 'converted'` 的对话 |
| `af5ee34` | Dashboard mount 时从 API 拉取项目列表到 store |
| `82ea649` | 侧栏新增 Projects 区域（前 5 个活跃项目） |
| `a2133b7` | i18n: `sidebar.viewAllProjects`、`sidebar.chats` |
| `03c9c8c` | 搜索结果中给 converted 对话显示徽章 |

**涉及的关键文件：**
- `components/layout/Sidebar.tsx`
- `app/(dashboard)/layout.tsx`
- `lib/i18n/locales/en.ts`、`zh.ts`

---

### Phase 5：@mention 通信（5 commits）

| Commit | 变更 |
|--------|------|
| `c7209d7` | 14 个 mention-parser 单元测试 |
| `52c090c` | `lib/utils/mention-parser.ts` — `parseMentions()` 纯函数 |
| `9a4fcac` | i18n: mention 自动补全翻译 key |
| `0fd9cb3` | ChatInput 添加 `agents` prop、`@` 自动补全弹窗 |
| `acb06a1` | ChatView 路由：@all → intervene API、@agent → message API |

**涉及的关键文件：**
- `lib/utils/mention-parser.ts`（新建）
- `lib/utils/__tests__/mention-parser.test.ts`（新建）
- `components/chat/ChatInput.tsx`
- `components/chat/ChatView.tsx`

---

### Phase 6：无感切换 UI（4 commits）

| Commit | 变更 |
|--------|------|
| `66ed77a` | i18n: `team.collaboration.activated` |
| `57b8222` | `team_update` / `team_comms` SSE 处理器、`sub_agent_start` 团队激活 |
| `41b4845` | 项目模式团队状态持久化 + handleSend 闪烁修复 |
| `24fc637` | CSS `transition-all duration-300` 渐进式展开 |

**涉及的关键文件：**
- `components/chat/ChatView.tsx`
- `lib/i18n/locales/en.ts`、`zh.ts`

---

## 二、SQL / 数据库变更

### PostgreSQL 迁移

| 文件 | 变更 |
|------|------|
| `database/migrations/046_add_project_execution_mode.sql` | `ALTER TABLE projects ADD COLUMN IF NOT EXISTS execution_mode text CHECK (execution_mode IN ('foreman', 'team'))` |

**部署注意：** 需要在 PostgreSQL 上执行此迁移。`IF NOT EXISTS` 保证幂等性。

### SQLite 差异 ⚠️

`database/sqlite-baseline.sql` 中：
- `conversations` 表的 `execution_mode` 约束值为旧值 (`'direct','single_agent','agent_team','workflow','agent_swarm'`)，与新的 `'foreman' | 'team'` 不一致
- `projects` 表**未同步新增** `execution_mode` 列

如果使用 SQLite 作为运行时数据库，需要手动同步：
```sql
-- 给 SQLite 的 projects 表加 execution_mode
ALTER TABLE projects ADD COLUMN execution_mode TEXT CHECK (execution_mode IN ('foreman', 'team'));
```

### baseline 已同步的

`database/migrations/000_baseline.sql` 中 projects 表已包含 `execution_mode` 列（line 57），新部署不需要额外操作。

---

## 三、验证清单

### 3.1 独立 Chat（`/` 页面）

| # | 场景 | 预期结果 | ✓/✗ |
|---|------|---------|------|
| 1 | 在首页创建新对话 | 对话 `project_id = null`，正常流式响应 |  |
| 2 | 删除对话 | 消息和对话记录消失 |  |
| 3 | 输入复杂任务，Agent 输出 `[[PROJECT_UPGRADE]]` | 显示 ProjectUpgradeCard 内联卡片 |  |
| 4 | 点击「转为项目」 | 调用 convert-to-project API，显示系统消息 + 项目链接，不自动跳转 |  |
| 5 | 转化后的对话 | 侧栏 Recents/Highlights 中不再显示该对话 |  |
| 6 | 搜索转化后的对话 | 搜索结果中显示 `converted` 徽章 |  |
| 7 | ChatInput 无 `@` 弹窗 | 独立 Chat 模式下无 agents prop，不触发自动补全 |  |
| 8 | 流式结束后 | 团队视图不显示（非项目模式正常重置） |  |

### 3.2 项目工作区（`/projects/[id]` 页面）

| # | 场景 | 预期结果 | ✓/✗ |
|---|------|---------|------|
| 9 | 打开项目页 | 显示项目头部（名称、描述）+ 内嵌 ChatView，不跳转到 `/` |  |
| 10 | 项目页发送消息 | conversation 自动关联 `project_id`，TopBar 隐藏 |  |
| 11 | 项目页空状态 | 显示项目模式提示文字，ChatInput 居下方 |  |
| 12 | 编辑项目名称/描述 | 菜单 → 编辑 → 保存，前端和 API 都更新 |  |
| 13 | 删除项目 | 跳回首页，项目从侧栏移除 |  |

### 3.3 Foreman → Team 无感切换

| # | 场景 | 预期结果 | ✓/✗ |
|---|------|---------|------|
| 14 | 服务端发送 `team_update` SSE | TeamStatusBar 平滑滑入（300ms 过渡动画），消息区域平滑收缩到 15vh |  |
| 15 | `sub_agent_start` 事件到达 | 如果 team_update 还没到，作为后备也激活团队视图 |  |
| 16 | 多个 agent 开始工作 | AgentLaneGrid 中显示各 agent 的步骤、流式输出 |  |
| 17 | TeamStatusBar 显示 | 显示 agent 数量、工作中数量、经过时间、mini-dots |  |
| 18 | 折叠/展开 | 点击 TeamStatusBar 可折叠（只留状态条）或展开（完整 AgentLaneGrid） |  |
| 19 | 流式结束后（项目模式）| 团队视图**保持可见**，用户可查看各 agent 工作结果 |  |
| 20 | 流式结束后（非项目模式）| 团队视图**正常隐藏** |  |
| 21 | 项目模式下发送新消息 | 团队视图**不闪烁**，新 SSE 事件会更新状态 |  |
| 22 | `execution_mode` 更新 | 团队激活时，项目的 `execution_mode` 自动从 `foreman` 变为 `team`（store + API PATCH） |  |
| 23 | CSS 过渡动画 | 消息区域和团队区域使用 `transition-all duration-300 ease-in-out`，非瞬间切换 |  |

### 3.4 @mention 通信

| # | 场景 | 预期结果 | ✓/✗ |
|---|------|---------|------|
| 24 | 项目模式 + 团队活跃，输入 `@` | 弹出自动补全菜单，含 `@all` + 各 agent |  |
| 25 | 输入 `@cod` | 过滤出匹配的 agent（如 `@coder`） |  |
| 26 | 方向键 + Enter/Tab | 可导航选择，选中后插入 `@agentName ` |  |
| 27 | Escape | 关闭自动补全菜单 |  |
| 28 | 发送 `@all stop` | POST 到 `/api/teams/:teamId/intervene`，body 包含 instruction |  |
| 29 | 发送 `@coder fix bug` | POST 到 `/api/teams/:teamId/agents/coder/message`，body 包含 message |  |
| 30 | 发送无 `@` 的文本 | 走标准 `/api/chat` foreman 路径 |  |
| 31 | 非项目模式 | ChatInput 无 agents prop，`@` 不触发任何弹窗 |  |

### 3.5 侧栏

| # | 场景 | 预期结果 | ✓/✗ |
|---|------|---------|------|
| 32 | 侧栏结构 | 显示 CHATS 区（Highlights + Recents）和 PROJECTS 区 |  |
| 33 | Highlights / Recents | 不显示 `status = 'converted'` 的对话 |  |
| 34 | Projects 区域 | 显示前 5 个最近活跃项目（按 updated_at 排序） |  |
| 35 | 点击项目 | 导航到 `/projects/{id}` |  |
| 36 | 「查看全部」 | 导航到 `/projects` 列表页 |  |

### 3.6 技术验证

| # | 场景 | 预期结果 | ✓/✗ |
|---|------|---------|------|
| 37 | TypeScript 编译 | `npx tsc --noEmit` 无错误 |  |
| 38 | 单元测试 | `npx jest --no-coverage` — 99 个测试全部通过 |  |
| 39 | mention-parser 测试 | 14 个测试覆盖：无 mention、单 agent、@all、未知名称、多 mention、大小写、邮箱排除、空字符串、去重 |  |
| 40 | Dev server 启动 | `npm run dev` 无编译错误 |  |
| 41 | PostgreSQL 迁移 | `046_add_project_execution_mode.sql` 可执行且幂等 |  |

---

## 四、架构变更全景

```
┌─────────────────────────────────────────────────────────┐
│                     路由层                               │
│  /           → ChatView (projectId=undefined)            │
│  /projects/[id] → 项目头 + ChatView (projectId=id)       │
└─────────────┬───────────────────────────────┬───────────┘
              │                               │
┌─────────────▼───────────────┐ ┌─────────────▼───────────┐
│   ChatView 双模式           │ │   侧栏                  │
│ • Foreman: 标准对话          │ │ • CHATS: 过滤 converted  │
│ • Team: 渐进式展开           │ │ • PROJECTS: Top 5 活跃   │
│ • @mention → 路由到 Team API │ │ • converted 徽章         │
│ • 项目模式持久化             │ └─────────────────────────┘
└─────────────┬───────────────┘
              │
┌─────────────▼───────────────────────────────────────────┐
│                     SSE 事件流                           │
│ team_update → 激活团队 + 更新 execution_mode             │
│ sub_agent_start → 后备激活                               │
│ team_comms → 记录 agent 间通信                           │
│ project_upgrade_suggested → 显示升级卡片                  │
│ done → 条件性重置（项目模式保持团队视图）                   │
└─────────────┬───────────────────────────────────────────┘
              │
┌─────────────▼───────────────┐ ┌─────────────────────────┐
│   Zustand Store             │ │   数据库                 │
│ • teamPanel (agents, teamId)│ │ • projects.execution_mode│
│ • teamCollaboration (active)│ │ • conversations.status   │
│ • projectUpgradePanel       │ │   ('converted')          │
│ • mateChatMessages          │ │ • convert-to-project API │
└─────────────────────────────┘ └─────────────────────────┘
```

---

## 五、已知限制

1. **ChatInput @mention 无高亮** — 纯 textarea 不支持内联样式渲染，`@agentName` 以纯文本插入。如需高亮，需改用 contentEditable 方案（后续优化）。

2. **SQLite baseline 未完全同步** — `sqlite-baseline.sql` 中 projects 表缺少 `execution_mode` 列，conversations 表的 execution_mode 约束值为旧值。使用 SQLite 需手动补充。

3. **handleSend 重置时序** — 项目模式下发送新消息时，`clearStreamingSteps()` 仍会清除之前的步骤数据，但 `teamCollaborationActive` 保持不变以避免闪烁。新流式响应的 SSE 事件会重新填充步骤数据。
