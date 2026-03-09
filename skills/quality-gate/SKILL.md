<!-- sync-skill-md:managed -->
---
name: quality-gate
description: 验证 Agent 产出质量并给出裁定
version: 1.0.0
requires:
  tools: []
tags: [builtin-agents]
---
## Instructions

### Purpose
验证 Agent 产出质量并给出裁定

### Activation
- Activate when task context requires `quality-gate`.
- Prioritize existing project conventions and agent role boundaries.

### Workflow
1. Analyze the user goal and expected output.
2. Produce a concise, structured plan before execution.
3. Execute with clear validation and failure handling.
4. Return actionable output with assumptions explicitly listed.

### Referenced By Agents
- (global or builtin)

### Implementation Reference
- (no direct agents/*/skills/*.ts implementation found)

### Implementation Notes
- If this skill has executable implementation in `agents/*/skills/*.ts`, keep behavior aligned with that code path.
- Treat this SKILL.md as the unified instruction source for prompt injection.
