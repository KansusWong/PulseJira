<!-- sync-skill-md:managed -->
---
name: market-scan
description: 搜索竞品和市场信息
version: 1.0.0
requires:
  tools: []
tags: [builtin-agents]
---
## Instructions

### Purpose
搜索竞品和市场信息

### Activation
- Activate when task context requires `market-scan`.
- Prioritize existing project conventions and agent role boundaries.

### Workflow
1. Analyze the user goal and expected output.
2. Produce a concise, structured plan before execution.
3. Execute with clear validation and failure handling.
4. Return actionable output with assumptions explicitly listed.

### Referenced By Agents
- (global or builtin)

### Implementation Reference
- `agents/researcher/skills/market-scan.ts`

### Implementation Notes
- If this skill has executable implementation in `agents/*/skills/*.ts`, keep behavior aligned with that code path.
- Treat this SKILL.md as the unified instruction source for prompt injection.
