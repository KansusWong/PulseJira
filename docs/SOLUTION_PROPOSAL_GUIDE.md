# 代码方案预览与选择功能使用指南

## 功能概述

代码方案预览与选择功能允许 Agent 在代码生成阶段向用户提出多个实现方案。**根据用户的 Trust Level 设置**，系统行为不同：

- **Collaborative 模式（人机协作）**：显示面板让用户预览和选择方案
- **Auto 模式（自动执行）**：Agent 自动选择推荐方案，不打断用户

这种设计既支持用户深度参与决策，也支持自动化执行。

## Trust Level 控制机制

### 设计原则：硬编码 + Prompt 混合

**硬编码层（工具层面）**：
- `ProposeSolutionsTool` 接收 `trustLevel` 参数（从用户偏好读取）
- Auto 模式：工具直接返回推荐方案，Agent 继续执行
- Collaborative 模式：工具返回提案标记，等待用户选择

**Prompt 层（Agent 决策）**：
- Architect soul/prompt 中说明何时使用 `propose_code_solutions`
- Agent 根据上下文智能判断是否需要提出多个方案

### 为什么这样设计？

| 方面 | 硬编码 | Prompt |
|------|--------|--------|
| trustLevel 判断 | ✅ 确定性行为 | ❌ 可能被 LLM 误解 |
| 何时提方案 | ❌ 无法灵活判断 | ✅ Agent 智能决策 |
| 性能 | ✅ 无额外 token | ❌ 每次传递指令 |
| 可维护性 | ✅ 易于测试 | ⚠️ 依赖 LLM 输出 |

**类比**：类似现有的 `requiresApproval` 机制，trustLevel 判断属于系统行为策略，应该硬编码保证可靠性。

## 核心组件

### 1. 数据类型 (`lib/core/types.ts`)

```typescript
// 文件变更
interface CodeFileChange {
  path: string;              // 文件路径（相对 workspace）
  action: 'create' | 'edit' | 'delete';
  content?: string;          // 新内容
  original_content?: string; // 原内容（用于 diff）
  description?: string;      // 变更说明
}

// 单个方案
interface CodeSolution {
  id: string;                // 方案唯一 ID
  name: string;              // 方案名称
  rationale: string;         // 方案理由
  trade_offs: string[];      // 优劣权衡
  files: CodeFileChange[];   // 文件变更列表
  estimated_lines: number;   // 预计代码行数
  risk_level: 'low' | 'medium' | 'high';
}

// 方案提案（包含多个方案）
interface CodeSolutionProposal {
  context: string;           // 需求背景
  solutions: CodeSolution[]; // 方案列表（2-3 个）
  recommended_index: number; // 推荐方案索引
}
```

### 2. 后端工具 (`lib/tools/propose-solutions.ts`)

Agent 使用 `propose_code_solutions` 工具向用户提出方案：

```typescript
await proposeSolutionsTool({
  context: "实现用户认证系统",
  solutions: [
    {
      id: "sol-1",
      name: "方案A：JWT + Redis",
      rationale: "高性能，支持分布式部署，业界主流方案",
      trade_offs: [
        "需要额外的 Redis 依赖",
        "略微增加系统复杂度",
        "需要管理 token 过期和刷新逻辑"
      ],
      files: [
        {
          path: "lib/auth/jwt.ts",
          action: "create",
          content: `export function generateToken(userId: string) { ... }`,
          description: "JWT token 生成和验证逻辑"
        },
        {
          path: "lib/auth/redis.ts",
          action: "create",
          content: `export class RedisSessionStore { ... }`,
          description: "Redis session 存储"
        }
      ],
      estimated_lines: 150,
      risk_level: "low"
    },
    {
      id: "sol-2",
      name: "方案B：Session + PostgreSQL",
      rationale: "简单直接，无额外依赖，易于调试",
      trade_offs: [
        "水平扩展性较差",
        "数据库压力较大",
        "Session 清理需要额外处理"
      ],
      files: [
        {
          path: "lib/auth/session.ts",
          action: "create",
          content: `export class PostgreSQLSessionStore { ... }`,
          description: "PostgreSQL session 存储"
        }
      ],
      estimated_lines: 80,
      risk_level: "medium"
    }
  ],
  recommended_index: 0  // 推荐第一个方案
});
```

### 3. 前端组件 (`components/chat/SolutionPreviewPanel.tsx`)

右侧面板显示方案列表，用户可以：
- 查看每个方案的详细信息
- 预览文件变更
- 对比不同方案的权衡
- 选择并批准一个方案

## 行为示例

### Auto 模式

```typescript
// 用户设置 trustLevel = 'auto'
// Agent 调用工具
await propose_code_solutions({
  context: "实现用户认证",
  solutions: [...], // 3 个方案
  recommended_index: 0
});

// 工具返回：
{
  auto_selected: true,
  selected_solution_id: "sol-1",
  message: "Auto-selected recommended solution: JWT + Redis

Rationale: 高性能，支持分布式...

You may now proceed to implement this solution."
}

// Agent 看到返回后，直接继续实现方案 1
// ✅ 用户无感知，自动执行
```

### Collaborative 模式

```typescript
// 用户设置 trustLevel = 'collaborative'
// Agent 调用工具
await propose_code_solutions({
  context: "实现用户认证",
  solutions: [...], // 3 个方案
  recommended_index: 0
});

// 工具返回：
{
  selected_solution_id: "",
  proposal: { context, solutions, recommended_index },
  message: "Solutions proposed. Awaiting user selection..."
}

// 前端：
// 1. 检测到提案（通过 SSE 或 result 检查）
// 2. 显示 SolutionPreviewPanel
// 3. 用户查看 3 个方案，选择方案 2
// 4. 调用 API 批准方案 2
// 5. Agent 继续执行选中的方案
```

## 使用场景

### 何时使用此功能？

1. **技术选型**：多个库/框架可选（如 Redux vs Zustand vs Context API）
2. **架构决策**：不同的系统架构方案（如单体 vs 微服务）
3. **实现策略**：同一功能的不同实现方式（如同步 vs 异步）
4. **性能优化**：不同的优化策略（如缓存方案、算法选择）

### 何时不应使用？

- 方案明显优劣分明时（直接实现最佳方案）
- 细节级的代码差异（如变量命名）
- 用户已明确指定实现方式时

## 集成流程

### 1. Agent 中使用工具

在 Architect 或 Developer agent 中导入并使用：

```typescript
import { ProposeSolutionsTool } from '@/lib/tools/propose-solutions';

// 在 agent 的 tools 数组中添加
const tools = [
  new ProposeSolutionsTool(),
  // ... other tools
];
```

### 2. SSE 事件流

当 Agent 调用 `propose_code_solutions` 时，系统会：

1. 发送 `solution_proposal` SSE 事件
2. 前端显示 SolutionPreviewPanel
3. 用户选择方案并批准
4. 前端发送 POST 到 `/api/conversations/[id]/solution`
5. 后端继续执行选中的方案

### 3. 后端处理

在 `chat-engine.ts` 中处理方案选择：

```typescript
// TODO: 实现方案执行逻辑
async function executeSolution(conversationId: string, solutionId: string) {
  const conversation = await getConversation(conversationId);
  const proposal = conversation.solution_proposal;
  const selectedSolution = proposal.solutions.find(s => s.id === solutionId);

  // 执行文件操作
  for (const file of selectedSolution.files) {
    if (file.action === 'create') {
      await createFile(file.path, file.content);
    } else if (file.action === 'edit') {
      await editFile(file.path, file.content);
    } else if (file.action === 'delete') {
      await deleteFile(file.path);
    }
  }
}
```

## Architect Prompt 指导

建议在 Architect 的 soul.md 或 system prompt 中添加以下指导：

```markdown
## Code Solution Proposals

When you identify multiple valid implementation approaches:

### When to Use propose_code_solutions:
- Choice significantly impacts project architecture or dependencies
- Trade-offs between performance, maintainability, simplicity are non-trivial
- Different technical stacks or paradigms are viable (e.g., REST vs GraphQL)
- Library/framework selection with meaningful differences

### When NOT to Use:
- Trivial differences (variable naming, code style)
- One approach is clearly superior
- User has explicitly specified the implementation method
- Differences are implementation details, not strategic choices

### How to Propose:
- Present 2-3 distinct solutions (not minor variations)
- Be honest about trade-offs (pros AND cons for each)
- Recommend the most balanced solution
- Focus on meaningful differences that matter to the user

### Examples:

✅ **Good uses**:
- "State management: Redux vs Zustand vs Jotai"
- "Authentication: JWT + Redis vs Session + PostgreSQL"
- "API design: REST vs GraphQL vs tRPC"

❌ **Bad uses**:
- "Use `const` or `let` for this variable"
- "Put this file in `/lib` or `/utils`"
- "Use single quotes or double quotes"
```

这样，Agent 会根据上下文智能地判断何时需要征询用户意见。

## 最佳实践

### 1. 方案数量
- **推荐 2-3 个方案**：足够对比，不会让用户overwhelmed
- 避免超过 3 个方案

### 2. 方案描述
- **rationale**: 清晰说明为什么这个方案可行
- **trade_offs**: 列出具体的优缺点，帮助用户权衡
- **risk_level**: 如实评估风险

### 3. 文件预览
- 提供完整的文件内容，不要省略
- 对于编辑操作，提供 `original_content` 以便显示 diff
- 添加 `description` 说明每个文件的作用

### 4. 推荐方案
- `recommended_index` 应基于技术评估，而非随机
- 在方案名称或描述中说明推荐理由

## 示例：完整的方案提案

```typescript
{
  context: "需要为博客系统添加评论功能，支持回复、点赞和举报",
  solutions: [
    {
      id: "sol-comments-nested",
      name: "方案A：嵌套评论（树形结构）",
      rationale: "使用自引用外键实现无限层级嵌套，UI 显示清晰，符合现代博客体验",
      trade_offs: [
        "✅ 用户体验好，支持深度讨论",
        "✅ 查询逻辑简单，使用递归 CTE",
        "❌ 深层嵌套时性能可能下降",
        "❌ 前端渲染复杂度较高"
      ],
      files: [
        {
          path: "database/migrations/010_add_comments.sql",
          action: "create",
          content: `CREATE TABLE comments (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES posts(id),
  parent_id UUID REFERENCES comments(id),
  author_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);`,
          description: "评论表结构，支持自引用"
        },
        {
          path: "lib/comments/nested-comments.ts",
          action: "create",
          content: `// 递归查询评论树
export async function getCommentTree(postId: string) {
  // WITH RECURSIVE implementation...
}`,
          description: "嵌套评论查询逻辑"
        }
      ],
      estimated_lines: 250,
      risk_level: "low"
    },
    {
      id: "sol-comments-flat",
      name: "方案B：扁平评论（只支持一级回复）",
      rationale: "类似 Twitter/微博模式，简化实现，性能更优",
      trade_offs: [
        "✅ 实现简单，性能好",
        "✅ 前端渲染直观",
        "❌ 不支持深度讨论",
        "❌ 回复关系不够清晰"
      ],
      files: [
        {
          path: "database/migrations/010_add_comments.sql",
          action: "create",
          content: `CREATE TABLE comments (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES posts(id),
  reply_to_id UUID REFERENCES comments(id),
  -- reply_to_id 只允许顶层评论，不支持多级
  author_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_no_nested_reply CHECK (
    reply_to_id IS NULL OR
    (SELECT reply_to_id FROM comments WHERE id = reply_to_id) IS NULL
  )
);`,
          description: "评论表结构，限制只能一级回复"
        }
      ],
      estimated_lines: 180,
      risk_level: "low"
    }
  ],
  recommended_index: 0
}
```

## 待完成功能

### 核心逻辑
- [ ] **在 chat-engine 中添加方案检测逻辑**：
  - 检测 Architect result 中是否包含 `propose_code_solutions` 工具调用
  - 如果 trustLevel 是 collaborative 且工具返回了 proposal：
    - yield `solution_proposal` SSE 事件
    - 暂停执行，等待用户选择
    - 用户选择后继续执行（传入 selected_solution_id）
  - 如果是 auto 模式：直接继续（工具已自动选择）

- [ ] **实现方案执行逻辑**：
  - 根据 selected_solution_id 找到对应方案
  - 执行方案中的 file 操作（create/edit/delete）
  - 可能需要新的工具 `execute_solution` 或在 Developer agent 中处理

### UI 增强
- [ ] 支持更丰富的 diff 视图（使用 react-diff-view）
- [ ] 支持代码高亮（使用 shiki 或 prismjs）
- [ ] 支持文件树预览（Monaco Editor tree view）
- [ ] 支持方案对比视图（并排显示多个方案）
- [ ] 添加国际化翻译（solution.*）

### Architect Prompt
- [ ] 在 `agents/architect/soul.md` 中添加方案提议指导
- [ ] 测试 Agent 是否正确使用工具（在合适的时机提出方案）

## 相关文件

- 类型定义: `lib/core/types.ts`
- 后端工具: `lib/tools/propose-solutions.ts`
- 前端组件: `components/chat/SolutionPreviewPanel.tsx`
- Store 管理: `store/slices/chatSlice.ts`
- SSE 处理: `components/chat/ChatView.tsx`
- API 路由: `app/api/conversations/[id]/solution/route.ts`
- 布局集成: `app/(dashboard)/layout.tsx`
