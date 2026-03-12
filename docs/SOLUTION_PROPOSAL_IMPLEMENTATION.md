# 代码方案预览功能实现总结

## 核心需求

用户提出的补充需求：
> 这个逻辑只有在【开发者模式】选择【人机协作】才成立。如果是 auto 模式，不需要中间过程，默认 Agent 自己设计，选择方案，用户只关注结果。

## 实现方案：Trust Level 控制

### 设计决策：硬编码 vs Prompt

**用户问题**："这个逻辑是硬编码好还是维护到 agent 的 soul/system prompt 更好"

**回答**：采用**混合方式**

#### 1. 硬编码层（工具行为）

**位置**：`lib/tools/propose-solutions.ts`

```typescript
export class ProposeSolutionsTool extends BaseTool {
  private trustLevel: TrustLevel;

  constructor(trustLevel: TrustLevel = 'collaborative') {
    super();
    this.trustLevel = trustLevel;
  }

  protected async _run(input: Input): Promise<SolutionToolResult> {
    const recommendedSolution = proposal.solutions[input.recommended_index];

    if (this.trustLevel === 'auto') {
      // ✅ 自动选择，不打断用户
      return {
        auto_selected: true,
        selected_solution_id: recommendedSolution.id,
        message: `Auto-selected: ${recommendedSolution.name}...`,
      };
    } else {
      // ⏸️ 等待用户选择
      return {
        selected_solution_id: '',
        proposal,
        message: `Solutions proposed. Awaiting user selection...`,
      };
    }
  }
}
```

**优点**：
- ✅ 行为确定性，不受 LLM 理解偏差影响
- ✅ 用户设置 trustLevel 后，系统行为保证一致
- ✅ 易于测试和调试
- ✅ 性能好，无额外 token 消耗

#### 2. Prompt 层（使用时机）

**位置**：`agents/architect/soul.md` (建议添加)

```markdown
## When to Use propose_code_solutions

Use this tool when:
- Multiple valid implementation approaches exist
- Trade-offs significantly impact architecture
- Choice affects project dependencies or structure

Do NOT use for:
- Trivial differences (naming, style)
- One approach is clearly superior
- Implementation details vs strategic choices
```

**优点**：
- ✅ Agent 可以根据上下文智能判断
- ✅ 灵活，可通过修改 prompt 调整策略
- ✅ 符合 Agent 自主决策理念

### 为什么不全部用 Prompt？

如果把 trustLevel 判断也放 prompt：

```markdown
If user preference is AUTO mode, automatically select the recommended solution.
If user preference is COLLABORATIVE mode, wait for user selection.
```

**问题**：
- ❌ LLM 可能理解错误或遗忘指令
- ❌ 每次调用都消耗 token 传递逻辑
- ❌ 难以保证行为一致性（不同模型可能表现不同）
- ❌ 测试困难（依赖 LLM 随机输出）

### 类比现有架构

系统中已有类似分层设计：

| 功能 | 硬编码 | Prompt | 原因 |
|------|--------|--------|------|
| Tool Approval | ✅ `requiresApproval` flag | ❌ | 安全策略，必须可靠 |
| Trust Level | ✅ `onApprovalRequired` 逻辑 | ❌ | 用户偏好，行为确定 |
| Agent 选择 | ❌ | ✅ "Use spawn_agent when..." | 需要智能判断 |
| 任务分解 | ❌ | ✅ "Break down complex tasks..." | 灵活处理上下文 |

**结论**：策略性行为（如 trustLevel）应硬编码，决策性行为（如何时提方案）应放 prompt。

## 实现细节

### 文件变更

| 文件 | 变更 | 说明 |
|------|------|------|
| `lib/tools/propose-solutions.ts` | ✅ 新增 | 工具实现，支持 trustLevel |
| `lib/core/types.ts` | ✅ 修改 | 添加类型定义 |
| `agents/architect/index.ts` | ✅ 修改 | 添加工具，接收 trustLevel |
| `skills/meta-pipeline.ts` | ✅ 修改 | 传递 trustLevel 参数 |
| `lib/services/chat-engine.ts` | ✅ 修改 | 从用户偏好读取并传递 trustLevel |
| `components/chat/SolutionPreviewPanel.tsx` | ✅ 新增 | 前端面板组件 |
| `store/slices/chatSlice.ts` | ✅ 修改 | 状态管理 |
| `components/chat/ChatView.tsx` | ✅ 修改 | SSE 事件处理 |
| `app/(dashboard)/layout.tsx` | ✅ 修改 | 面板渲染集成 |

### 数据流

#### Auto 模式

```
User (trustLevel=auto)
  ↓
Chat Engine (读取偏好)
  ↓
Architect Agent (trustLevel='auto')
  ↓
ProposeSolutionsTool (构造函数接收 trustLevel)
  ↓
工具执行：auto_selected = true
  ↓
Agent 看到自动选择的结果，继续执行
  ↓
✅ 用户无感知，自动完成
```

#### Collaborative 模式

```
User (trustLevel=collaborative)
  ↓
Chat Engine (读取偏好)
  ↓
Architect Agent (trustLevel='collaborative')
  ↓
ProposeSolutionsTool (构造函数接收 trustLevel)
  ↓
工具执行：awaiting_selection = true, proposal = {...}
  ↓
[待实现] Chat Engine 检测到 proposal
  ↓
yield { type: 'solution_proposal', data: {...} }
  ↓
前端显示 SolutionPreviewPanel
  ↓
用户选择方案
  ↓
POST /api/conversations/[id]/solution
  ↓
[待实现] 继续执行选中的方案
```

## ✅ 已完成工作（2024-03-12 更新）

### 1. ✅ Chat Engine 集成（已完成）

**实现方案**：使用 Blackboard 作为通信机制

**实现位置**：
- `lib/tools/propose-solutions.ts` - 在 collaborative 模式下写入 blackboard
- `lib/services/chat-engine.ts` (line 1554+) - Architect 完成后检测 blackboard

**实现代码**：
```typescript
// ProposeSolutionsTool._run (collaborative mode)
if (this.blackboard) {
  await this.blackboard.write({
    key: 'architect.solution_proposal',
    value: proposal,
    type: 'decision',
    author: 'architect',
    tags: ['solution', 'awaiting_user'],
  });
}

// chat-engine.ts executePlan (after architect completes)
const solutionProposal = blackboard.read('architect.solution_proposal');
if (solutionProposal && trustLevel === 'collaborative') {
  channel.push({
    type: 'solution_proposal',
    data: {
      status: 'pending_selection',
      proposal: solutionProposal,
    },
  });

  await this.updateConversation(conversationId, {
    solution_proposal: solutionProposal,
    solution_status: 'pending',
  } as any);
}
```

**优点**：
- ✅ 无需修改 BaseAgent 核心逻辑
- ✅ 利用现有 blackboard 基础设施
- ✅ 自动持久化到数据库
- ✅ 支持状态恢复

### 2. ✅ Architect Prompt 指导（已完成）

**位置**：`agents/architect/soul.md`

**添加内容**：
- 何时使用 propose_code_solutions（场景列表）
- 何时不应使用（反例）
- 如何提出方案（最佳实践）
- 用户模式说明（Auto vs Collaborative）
- 完整示例

**示例片段**：
```markdown
## Code Solution Proposals

### 何时提出方案 (When to Propose)

✅ 应该使用的场景：
- 技术选型对架构影响显著（如 REST vs GraphQL）
- 状态管理方案有明确的权衡（如 Redux vs Zustand）
...

❌ 不应使用的场景：
- 细节级差异（变量命名、代码风格）
- 一个方案明显优于其他
...
```

### 3. ✅ 方案执行逻辑（已完成）

**新增文件**：`lib/services/solution-executor.ts`

**核心功能**：
- `executeSolution()` - 执行方案中的所有文件操作
- `applyFileChange()` - 应用单个文件变更（create/edit/delete）
- 安全检查：确保文件路径在 workspace 内
- 错误处理：收集所有错误但继续执行

**API 集成**：`app/api/conversations/[id]/solution/route.ts`

```typescript
// 用户批准后
const selectedSolution = proposal.solutions.find(s => s.id === solution_id);
const executionResult = await executeSolution(selectedSolution, workspacePath);

// 更新状态
await supabase.from('conversations').update({
  selected_solution_id: solution_id,
  solution_status: executionResult.success ? 'executed' : 'failed',
});
```

### 4. ✅ UI 增强（基础版已完成）

已实现：
- ✅ 方案卡片展示
- ✅ 文件列表预览
- ✅ 文件内容模态框
- ✅ 推荐方案标记
- ✅ 风险等级标识
- ✅ 优劣权衡列表

可选增强（未实现）：
- [ ] 使用 react-diff-view 的丰富 diff 视图
- [ ] 使用 shiki 的代码高亮
- [ ] Monaco Editor 文件树预览
- [ ] 方案对比视图（并排显示）

## 测试计划

### Auto 模式测试

1. 设置用户偏好：`trustLevel = 'auto'`
2. 触发需要方案选择的场景（如"实现用户认证"）
3. 验证：
   - Agent 自动选择推荐方案
   - 不显示 SolutionPreviewPanel
   - 用户无感知，直接看到最终结果

### Collaborative 模式测试

1. 设置用户偏好：`trustLevel = 'collaborative'`
2. 触发场景
3. 验证：
   - 前端显示 SolutionPreviewPanel
   - 用户可以查看 3 个方案
   - 用户可以预览文件内容
   - 用户选择方案后继续执行
   - 切换对话后面板状态保留（LRU 缓存）

### 边界情况测试

- 用户提供了 1 个方案（应该报错或自动执行）
- 用户提供了 4 个方案（应该被限制为 3 个）
- recommended_index 越界
- 快速切换对话时的竞态条件

## 总结

### ✅ 已完成

- Trust Level 控制机制（硬编码在工具层）
- 前端面板组件
- 状态管理和 SSE 事件定义
- 类型定义和 API 路由
- 参数传递链路（chat-engine → meta-pipeline → architect → tool）

### ⏸️ 待完成

- Chat Engine 中的方案检测和 SSE 发送逻辑
- Collaborative 模式的暂停/恢复机制
- 方案执行逻辑（file 操作）
- Architect prompt 指导

### 🎯 设计优势

1. **可靠性**：trustLevel 判断硬编码，行为确定
2. **灵活性**：Agent 通过 prompt 智能决策何时提方案
3. **用户体验**：
   - Auto 模式：无缝自动化
   - Collaborative 模式：深度参与决策
4. **可扩展**：未来可添加更多 trust level（如 'strict', 'minimal'）
5. **一致性**：与现有 tool approval 机制对齐

---

**参考文档**：`docs/SOLUTION_PROPOSAL_GUIDE.md`
