# Chat 与 Project 分离设计方案

## Context

当前 Chat 和 Project 共用 `/` 页面的 ChatView，项目页面发起的对话会跳转回首页，两者边界模糊。需要将 Chat 和 Project 作为独立实体分离，明确数据归属和生命周期差异。

**核心模型：**
- **Chat**：轻量入口，产出临时（用户删除对话 → 产出消失）
- **Project**：产出常驻（即使删除项目引用，产出物仍在工作空间）
- **升级路径**：Chat 可通过三种方式升级为 Project（关键词/Agent判断/Context阈值）
- **Project 执行**：采用"包工头 + Team"模式，Agent 结对协作，所有过程记录常驻

---

## 一、路由与页面架构

### 变更

| 路由 | 当前 | 目标 |
|------|------|------|
| `/` | ChatView（所有对话混合） | ChatView（仅独立对话，project_id = null） |
| `/projects/[id]` | 项目信息 + ChatInput → 跳转 `/` | 项目工作区，内嵌对话/Team 视图，不跳转 |

### `/` 页面（独立 Chat）
- 保持现有 `ChatView` 不变
- 移除 `project_created` SSE 事件的自动导航逻辑
- 新增：当 Agent 建议升级为 Project 时，显示 `ProjectUpgradeCard` 内联卡片
- 用户同意升级后，显示系统消息 + 项目链接，不自动跳转

### `/projects/[id]` 页面（项目工作区）
- **移除**：当前的 ChatInput 跳转逻辑
- **新增**：内嵌 `ProjectWorkspaceView` 组件，包含：
  - 项目元信息头（名称、描述、状态）
  - 对话区域（复用 ChatView 的消息渲染逻辑，通过 props 切换模式）
  - 右侧面板（ProjectFilesPanel，已有）
- 项目页面直接创建 `project_id` 绑定的 conversation，不跳转

### 关键文件
- `app/(dashboard)/page.tsx` — 无变更
- `app/(dashboard)/projects/[projectId]/page.tsx` — 重写，内嵌工作区
- `components/chat/ChatView.tsx` — 新增 `projectId` prop 支持项目模式；新增 `project_upgrade_suggested` 事件处理

**设计决策：不 fork ChatView，而是通过 props 复用。** ChatView 接受可选的 `projectId` prop：
- `projectId = undefined`：独立 Chat 模式（当前行为）
- `projectId = "xxx"`：项目模式（conversation 自动关联 project_id，显示项目上下文）

---

## 二、Chat → Project 转化流程

### 三种触发路径

```
优先级：关键词触发 > Agent 自主判断 > Context 阈值

1. 关键词触发
   用户消息包含"转项目""用Team""转Team模式"等
   → Agent 识别意图 → 输出 [[PROJECT_UPGRADE]] marker

2. Agent 自主判断
   Agent 在 system prompt 中被指导评估任务复杂度
   当判断为项目级时 → 输出 [[PROJECT_UPGRADE]] marker

3. Context 阈值
   已有实现：CompactionUpgradeService，context 达 75%
   → 系统提示用户是否转 Team
   → 复用现有 compaction_upgrade_required 事件
```

### 转化 API

**新增 `POST /api/conversations/[id]/convert-to-project`**

```
Request:  { projectName?: string }
Response: { success: true, project_id: string, summary: string }
```

处理逻辑：
1. 加载 conversation 和全部 messages
2. 调用 LLM 生成摘要（目标、决策、关键发现）
3. 扫描 messages 的 `metadata.attachments` 和 `metadata.exportable`
4. 创建 Project（复用 `projects/project-service.ts` 的 `createProject()`）
5. 复制产出物文件到项目 workspace
6. 更新 conversation：`status = 'converted'`, `project_id = project_id`
7. 在项目的第一条消息中存入摘要（给包工头 Agent 提供上下文）

### 前端流程

```
Agent 输出 [[PROJECT_UPGRADE]] marker
    ↓
ChatEngine 解析 marker，emit SSE event: project_upgrade_suggested
    ↓
ChatView 显示 ProjectUpgradeCard（内联卡片）
  - "这个任务比较复杂，建议转为项目处理"
  - [转为项目] [继续聊天]
    ↓
用户点击 [转为项目]
    ↓
前端 POST /api/conversations/:id/convert-to-project
    ↓
显示系统消息："已转为项目 **{name}**。[打开项目](/projects/{id})"
原 Chat 标记为 converted，侧栏显示 converted 徽章
```

### 关键文件
- 新建：`app/api/conversations/[id]/convert-to-project/route.ts`
- 新建：`components/chat/ProjectUpgradeCard.tsx`（参考现有 `CompactionUpgradeCard.tsx`）
- 修改：`lib/services/chat-engine.ts` — 新增 `[[PROJECT_UPGRADE]]` marker 解析，emit `project_upgrade_suggested` 事件
- 修改：`store/slices/chatSlice.ts` — 新增 `projectUpgradePanel` 状态
- 修改：`lib/core/types.ts` — ChatEvent union 新增 `project_upgrade_suggested` 类型

---

## 三、项目内交互模型（包工头 → Team 无感切换）

### 执行模式

```
项目创建
    ↓
Foreman 模式（单 Agent 对话）
  UI：标准对话界面，与 Chat 几乎一致
  区别：对话关联 project_id，产出物写入 project workspace
    ↓ （Agent 判断需要 Team / 用户 @team / context 阈值）
Team 模式（多 Agent 协作）
  UI：对话区域 + AgentLane 渐进展开
  复用：TeamCollaborationView, AgentLane, AgentLaneGrid, TeamStatusBar
```

### 无感切换实现

- Foreman 模式：ChatView 以 `projectId` 模式渲染，标准对话
- 当 Team 被激活时（通过 `handleTeamInit()`，已有实现）：
  - SSE 事件 `sub_agent_start` 触发 AgentLane 渲染
  - 对话区域上方渐进式展开 TeamStatusBar
  - 已有的 `teamPanel` state 在 chatSlice 中管理
- 用户感知：从"和一个人聊"自然过渡到"多个人在干活"

### Schema 变更

```sql
ALTER TABLE projects ADD COLUMN execution_mode text
  CHECK (execution_mode IN ('foreman', 'team'));
```

- 项目创建时：`execution_mode = 'foreman'`
- Team 激活时：`execution_mode = 'team'`

### 关键文件
- 修改：`app/(dashboard)/projects/[projectId]/page.tsx` — 内嵌 ChatView(projectId)
- 修改：`components/chat/ChatView.tsx` — projectId 模式下自动关联 project
- 修改：`projects/types.ts` — Project 接口添加 `execution_mode`
- 修改：`projects/project-service.ts` — 支持 `execution_mode` 字段
- 复用：`components/chat/team/` 目录下所有组件（AgentLane, TeamStatusBar, AgentLaneGrid）
- 复用：`lib/services/mission-engine.ts`（7 阶段执行）
- 复用：`lib/services/mate-message-queue.ts`（agent 通信）

---

## 四、@mention 通信系统

### 实现

在项目模式的 ChatInput 中支持 @mention：

**新建 `lib/utils/mention-parser.ts`：**
```typescript
interface ParsedMessage {
  mentions: string[];        // 被 @ 的 agent 名称列表
  targetAgent: string | null; // 单个目标 agent，或 null 表示 @all
  cleanContent: string;       // 去掉 @mention 后的消息内容
}
function parseMentions(text: string, availableAgents: string[]): ParsedMessage;
```

**路由逻辑（在项目模式 ChatView 中）：**
- 无 @mention → 消息发给 foreman（标准 `/api/chat`）
- `@all` → `POST /api/teams/:teamId/intervene`（broadcast，已有实现）
- `@specificAgent` → `POST /api/teams/:teamId/agents/:agentName/message`（已有实现）

**ChatInput 增强：**
- 新增可选 `agents?: AgentStatus[]` prop
- 输入 `@` 时弹出 agent 列表自动补全
- 选中后插入 `@agentName`，高亮显示

### 关键文件
- 新建：`lib/utils/mention-parser.ts`
- 修改：`components/chat/ChatInput.tsx` — 添加 @mention 自动补全
- 复用：`app/api/teams/[teamId]/intervene/route.ts`
- 复用：`lib/services/mate-message-queue.ts`

---

## 五、侧栏变更

### 当前结构
```
[New Chat] [Search]
[Projects] [Graph]
--- HIGHLIGHTS ---
--- RECENTS ---
[Settings]
```

### 目标结构
```
[New Chat] [Search]
[Projects] [Graph]
--- CHATS ---
  Highlights（过滤掉 status='converted' 的对话）
  Recents（过滤掉 status='converted' 的对话）
--- PROJECTS ---
  最近 3-5 个活跃项目（按 updated_at 排序）
  "查看全部" → /projects
[Settings]
```

### 实现
- `recentConversations` memo 添加 `.filter(c => c.status !== 'converted')`
- 新增 Projects 区域，从 store 读取项目列表
- 点击项目导航到 `/projects/{id}`
- Converted 的 Chat 如果要显示，带 `converted` 徽章

### 关键文件
- 修改：`components/layout/Sidebar.tsx`
- 修改：`lib/i18n/locales/en.ts` + `zh.ts` — 新增 i18n keys

---

## 六、数据归属规则

| 数据 | 归属 | 生命周期 |
|------|------|----------|
| Chat 消息 | `conversation_id` | 临时（用户删除对话 → 消失） |
| Chat 产出文件 | `conversation_id` 的 upload 目录 | 随对话删除 |
| Project 文件/代码 | `project_id` 的 workspace | 常驻（删除项目引用不影响） |
| Project 任务 | `project_id` | 常驻 |
| Agent 间通信 | `team_id` → `project_id` | 常驻 |
| Agent 执行步骤 | `team_id` → `project_id` | 常驻 |
| 用户对 Agent 指令 | `team_id` → `project_id` | 常驻 |
| 转化摘要 | `project_id` 的首条消息 | 常驻 |

---

## 七、实施阶段

### Phase 1：数据层 + 转化 API
- Schema 变更（projects 表加 execution_mode）
- 新建 convert-to-project API
- 更新 types 和 service

### Phase 2：路由分离
- ChatView 添加 projectId prop 支持
- 重写 projects/[projectId]/page.tsx，内嵌 ChatView
- `/api/chat` 支持 project_id 传参

### Phase 3：升级触发
- `[[PROJECT_UPGRADE]]` marker 解析
- ProjectUpgradeCard 组件
- SSE 事件处理

### Phase 4：侧栏
- 过滤 converted 对话
- 新增 Projects 区域

### Phase 5：@mention 通信
- mention-parser 工具
- ChatInput @mention 自动补全
- 路由到现有 intervene/message API

### Phase 6：无感切换 UI
- Foreman → Team 渐进式展开
- 复用 TeamCollaborationView

---

## 八、验证方式

1. **独立 Chat**：在 `/` 创建对话，确认 `project_id = null`，删除对话后消息消失
2. **升级流程**：在 Chat 中输入复杂任务 → Agent 建议升级 → 点击转为项目 → 跳转项目页 → 摘要和产出物已在项目中
3. **项目内对话**：在 `/projects/[id]` 直接发消息，确认 conversation 关联 project_id
4. **Team 模式**：项目内触发 Team → AgentLane 渐进展开 → 过程记录持久化
5. **@mention**：输入 `@agent-name message` → 消息路由到指定 agent
6. **侧栏**：converted 的 Chat 不出现在 Recents 中；Projects 区域显示活跃项目
