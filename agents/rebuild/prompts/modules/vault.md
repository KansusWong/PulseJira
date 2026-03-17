# 资产治理（Vault）使用指南

你拥有 Vault 资产治理工具，用于追踪 Epic 执行过程中产出的制品，并实现跨项目能力复用。

## 何时调用 summary

**每次 Epic 完成后**，调用 `vault(command="summary")` 写入结构化总结：
- 记录本次 Epic 产出了哪些新制品（skill、tool、doc、pptx、code）
- 记录复用了哪些已有制品
- 构建制品间的关系图谱

## 何时调用 search

**每次新 Epic 分解前**，调用 `vault(command="search")` 搜索已有能力：
- 检查是否已有可直接复用的 skill/tool
- 避免重复造轮子
- 发现可组合的已有能力

## 命令用法

| 命令 | 示例 | 说明 |
|------|------|------|
| **init** | `vault(command="init", industry_tags=["fintech", "审批"])` | 首次使用时初始化 |
| **summary** | `vault(command="summary", epic_id="epic-001", title="智能审批流程", tasks=[...], knowledge_delta={...})` | Epic 完成后写入总结 |
| **search** | `vault(command="search", query="审批 流程", type_filter="skill")` | 搜索可复用能力 |
| **graph** | `vault(command="graph", query_type="neighbors", node_id="epic-001")` | 查看关系图谱 |
| **list** | `vault(command="list", type_filter="tool", limit=10)` | 列出知识库条目 |
| **status** | `vault(command="status")` | 查看统计概览 |
| **supersede** | `vault(command="supersede", artifact_id="abc123", new_artifact_name="天气查询v2", new_artifact_description="...")` | 创建制品新版本 |
| **visualize** | `vault(command="visualize")` 或 `vault(command="visualize", focus_node="epic-001", depth=2)` | 生成 Mermaid 知识图谱 |
| **export** | `vault(command="export")` | 导出 vault 为 JSON bundle |
| **import** | `vault(command="import", source_workspace="/path/to/other/project")` | 从其他 workspace 导入 |

## Graph 边类型语义

| 边类型 | 含义 | 示例 |
|--------|------|------|
| `produced` | Epic 产出了某制品 | epic-001 → skill-weather |
| `depends_on` | 制品依赖另一制品 | skill-report → tool-fetch |
| `reuses` | 新制品复用了已有制品 | skill-v2 → skill-v1 |
| `part_of` | 任务属于某 Epic | task-001 → epic-001 |
| `supersedes` | 新版本替代旧版本 | tool-v2 → tool-v1 |

## knowledge_delta 结构

```json
{
  "new_artifacts": [
    {
      "type": "skill",
      "path": "skills/weather-query/SKILL.md",
      "name": "天气查询",
      "description": "调用天气API查询指定城市天气",
      "tags": ["weather", "api"],
      "depends_on": ["tool-http-fetch"]
    }
  ],
  "reused_artifacts": ["artifact-id-xxx"],
  "new_edges": [
    { "source": "skill-weather", "target": "tool-http-fetch", "type": "depends_on" }
  ]
}
```

## 最佳实践

1. **actual ≠ planned**：summary 中记录的是实际产出，不是计划产出
2. **tags 规范化**：使用小写英文 tags，如 `["fintech", "approval", "workflow"]`
3. **description 要可搜索**：description 是搜索的主要匹配源，要写清楚制品的用途和能力
4. **善用 reused_artifacts**：每次复用已有制品时，将其 artifact_id 加入 reused_artifacts，系统会自动递增复用计数
5. **边类型要准确**：`produced` 用于 Epic→制品，`depends_on` 用于制品间依赖，`reuses` 用于标记复用关系
6. **版本迭代用 supersede**：当制品需要大幅更新时，使用 supersede 创建新版本而非直接覆盖，保留版本演进历史
7. **跨项目复用用 export/import**：先在源项目 export，再在目标项目 import，去重合并
8. **可视化辅助分析**：使用 visualize 生成 Mermaid 图，用 focus_node + depth 聚焦特定区域
