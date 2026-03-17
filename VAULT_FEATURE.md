# Vault — 资产治理系统

## 概述

Vault 是 RebuilD 平台的资产治理子系统，为 Epic 执行过程中产生的制品（skill、tool、doc、pptx、code）提供结构化追踪和复用能力。

设计理念参考 Obsidian 知识图谱：
- **Epic Summary**：每次 Epic 完成后写入结构化总结
- **Manifest**：维护可复用能力清单（知识库）
- **Graph**：构建制品间的关系图谱
- **Search**：新 Epic 分解前搜索已有能力，实现复用闭环

## 数据模型

### VaultManifest

```typescript
interface VaultManifest {
  vault_id: string;
  industry_tags: string[];
  knowledge_base: ArtifactEntry[];
  updated_at: string;
}
```

### ArtifactEntry

```typescript
interface ArtifactEntry {
  artifact_id: string;
  type: 'skill' | 'tool' | 'doc' | 'pptx' | 'code';
  path: string;
  name: string;
  description: string;
  created_by_epic: string;
  created_by_agent: string;
  created_at: string;
  reuse_count: number;
  tags: string[];
  depends_on: string[];
  version: number;
}
```

### VaultGraph

```typescript
interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// GraphNode.type: skill | tool | doc | pptx | code | epic | task
// GraphEdge.type: produced | depends_on | reuses | part_of | supersedes
```

## 存储结构

```
{workspace}/vault/
  manifest.json        # 知识库清单
  graph.json           # 关系图谱
  embeddings.json      # 语义搜索向量缓存
  export.json           # 导出 bundle（export 命令生成）
  summaries/           # 按 Epic 归档的总结
    {epic_id}.json
```

## 工具命令（10 个）

| 命令 | 说明 | 核心参数 |
|------|------|---------|
| `init` | 初始化 vault 目录 | `industry_tags?` |
| `summary` | 写入 Epic 总结 | `epic_id`, `title`, `tasks`, `knowledge_delta` |
| `search` | 搜索知识库（语义+关键词+热度） | `query`, `type_filter?`, `tags?` |
| `graph` | 查询关系图谱 | `query_type`, `node_id?`, `node_type?` |
| `list` | 列出知识库条目 | `type_filter?`, `tags?`, `limit?` |
| `status` | vault 统计概览 | 无 |
| `supersede` | 创建制品新版本 | `artifact_id`, `new_artifact_name?`, `new_artifact_description?` |
| `visualize` | 生成 Mermaid 知识图谱 | `focus_node?`, `depth?` |
| `export` | 导出 vault 为 JSON bundle | 无 |
| `import` | 从其他 workspace 导入 | `source_workspace` |

## 文件清单

| 文件 | 说明 |
|------|------|
| `lib/tools/vault.ts` | VaultTool 核心实现（10 命令，1150 行） |
| `lib/services/vault-store.ts` | Supabase 持久化服务（fire-and-forget） |
| `agents/rebuild/prompts/modules/vault.md` | Lazy prompt module |
| `lib/tools/index.ts` | 添加 VaultTool 导出 |
| `agents/rebuild/index.ts` | 注册工具 + lazy module + 子agent屏蔽 + Tier2 工具组 |
| `agents/rebuild/prompts/system.md` | 注入 Epic 生命周期行为规则 |

## 关键设计决策

- **文件系统优先**：JSON 文件存储，与 MemoryTool 相同的读写模式
- **Supabase 备份**：fire-and-forget 模式，Supabase 未配置时静默跳过
- **Append-only graph**：load → append → save
- **自动初始化**：summary 命令在 vault 未初始化时自动 init
- **搜索评分**：有 embedding 时 keyword 40% + semantic 30% + reuse 30%；无 embedding 时 keyword 70% + reuse 30%
- **子 Agent 屏蔽**：vault 加入 BLOCKED_SUBORDINATE_TOOLS，仅 Master Agent 可写入资产数据
- **去重**：已存在的 node/edge 不重复添加
- **版本管理**：supersede 创建新版本，通过 graph edge 追踪演进
- **跨项目共享**：export/import 支持 bundle 和原始文件两种导入源

## 实现进度

### Phase 1 — 核心工具（已完成 ✓）

- [x] `lib/tools/vault.ts` — 6 命令全部实现（init/summary/search/graph/list/status）
- [x] `agents/rebuild/prompts/modules/vault.md` — Lazy prompt module
- [x] `lib/tools/index.ts` — VaultTool 导出
- [x] `agents/rebuild/index.ts` — import + 实例化 + lazy module + BLOCKED_SUBORDINATE_TOOLS
- [x] `VAULT_FEATURE.md` — 功能文档
- [x] TypeScript 编译通过（`npx tsc --noEmit` 零错误）

### Phase 2 — 闭环集成（已完成 ✓）

#### 做了什么

1. **Tier 2 工具组注册** — 让 vault 工具按需自动加载
2. **System prompt 行为注入** — 让 Agent 在 Epic 生命周期的关键节点主动调用 vault

#### 怎么做的

**改动 1：`agents/rebuild/index.ts` — TIER2_TOOL_GROUPS 新增 vault 组**

在 `TIER2_TOOL_GROUPS` 数组末尾追加了一个 vault 工具组：
- `tools: ['vault']`
- `triggerKeywords`: 匹配 vault/asset/知识库/制品/复用/reuse/artifact/epic summary/graph/manifest
- 效果：用户消息中出现相关关键词时，vault 工具自动从 Tier 2 提升到可用状态，无需始终占用 prompt tokens

**改动 2：`agents/rebuild/prompts/system.md` — 末尾追加「资产治理生命周期」章节**

新增约 30 行规则，定义两个行为触发点：
- **Epic 开始前**：Agent 必须先调用 `vault search` 搜索可复用能力，避免重复造轮子
- **Epic 完成后**：Agent 必须调用 `vault summary` 写入结构化总结，记录新制品和复用关系
- 同时定义了「什么算 Epic 级任务」和「什么算制品」的判断标准，防止 Agent 对简单任务也触发 vault

#### 进度更新

- [x] **Tier 2 工具组注册**：vault 加入 `TIER2_TOOL_GROUPS`，关键词触发自动加载
- [x] **System prompt 注入**：在 `system.md` 末尾注入 Epic 生命周期行为规则
- [x] **Epic 开始钩子**：通过 system prompt 规则实现（Epic 分解前搜索）
- [x] **Epic 完成钩子**：通过 system prompt 规则实现（Epic 完成后写入 summary）
- [x] TypeScript 编译通过

### Phase 3 — 增强能力（已完成 ✓）

#### 做了什么

5 个增强能力全部实现：Supabase 备份、语义搜索、版本管理、可视化、跨项目共享。

#### 怎么做的

**1. Supabase 备份 — 新建 `lib/services/vault-store.ts`**

完全复制 `memory-store.ts` 模式，创建 `VaultStore` 单例：
- `hydrate(projectId)`: 从 `vault_artifacts` 表拉取数据，合并到内存缓存
- `persist(projectId, entry)`: 更新缓存 + fire-and-forget upsert 到 Supabase
- `remove(projectId, id)`: 从缓存删除 + fire-and-forget delete
- Supabase 未配置时所有 DB 操作静默跳过
- `ArtifactEntry` 类型从此文件导出，vault.ts 导入复用（与 memory-store 导出 MemoryEntry 的模式一致）

在 `vault.ts` 的 `_summary` 和 `_supersede` 中集成：
- 新制品 → `vaultStore.persist(pid, artifact)` (fire-and-forget)
- 复用计数更新 → 也 persist 到 Supabase

**2. 语义搜索 — 增强 `_search` 方法**

- 新增 `embeddings.json` 存储（`vault/embeddings.json`），缓存每个制品的 embedding 向量
- `_summary` 写入新制品时，fire-and-forget 调用 `generateEmbedding` 生成向量并存储
- `_search` 时：先 `tryGenerateEmbedding(query)` 生成查询向量，再与存储的向量做 cosine similarity
- 有 embedding 时评分权重：keyword 40% + semantic 30% + reuse 30%
- 无 embedding 时回退原逻辑：keyword 70% + reuse 30%
- `tryGenerateEmbedding` 使用动态 import（`await import('../services/rag')`），避免对 OpenAI 的硬依赖
- 新增 `cosineSimilarity` 函数：标准余弦相似度计算

**3. 版本管理 — 新增 `supersede` 命令**

- 输入：`artifact_id`（被迭代的旧制品）+ 可选的 `new_artifact_name/description/path/tags`
- 逻辑：
  1. 从 manifest 查找旧制品
  2. 创建新制品：type/depends_on 继承，version = old.version + 1，reuse_count 归零
  3. 新制品加入 manifest
  4. Graph 中添加新制品节点 + `supersedes` 边（new → old）
  5. Fire-and-forget Supabase persist + embedding 生成

**4. 可视化 — 新增 `visualize` 命令**

- 读取 graph.json，生成 Mermaid `graph TD` 代码块
- 每种节点类型使用不同形状：epic=stadium, task=rounded, skill=hexagon, tool=subroutine, doc=asymmetric, pptx=cylindrical, code=double-circle
- 每种类型配色：epic=蓝, task=灰, skill=绿, tool=橙, doc=黄, pptx=粉, code=紫
- 支持 `focus_node` + `depth` 参数：BFS 遍历指定深度的子图，聚焦特定区域
- 节点 ID 通过 `sanitizeMermaidId` 转义，避免特殊字符导致 Mermaid 解析错误

**5. 跨项目共享 — 新增 `export` / `import` 命令**

- `export`：将 manifest + graph + embeddings + summaries 打包为 `vault/export.json`
- `import`：从 `source_workspace` 导入，优先读 export bundle，回退读原始文件
- 合并策略：artifact_id / node_id / edge_key 去重，不覆盖已有数据
- Summaries 也参与导入导出：bundle 中包含或从 `summaries/` 目录逐文件复制

#### 进度更新

- [x] **Supabase 备份**：`lib/services/vault-store.ts` + vault.ts 集成
- [x] **语义搜索**：embedding 存储 + cosine similarity + 三权重评分
- [x] **版本管理**：`supersede` 命令 + supersedes 边 + 版本号递增
- [x] **可视化**：`visualize` 命令 + Mermaid 生成 + 节点形状/颜色 + BFS 聚焦
- [x] **跨项目共享**：`export`/`import` 命令 + bundle 格式 + 去重合并
- [x] TypeScript 编译通过
