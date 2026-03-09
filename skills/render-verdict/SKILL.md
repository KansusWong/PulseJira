<!-- sync-skill-md:managed -->
---
name: render-verdict
description: 基于加权评分做出最终裁决
version: 1.0.0
requires:
  tools: []
tags: [builtin-agents]
---
## Instructions

### Purpose
基于加权评分做出最终裁决

### Activation
- Activate when task context requires `render-verdict`.
- Prioritize existing project conventions and agent role boundaries.

### Workflow
1. Analyze the user goal and expected output.
2. Produce a concise, structured plan before execution.
3. Execute with clear validation and failure handling.
4. Return actionable output with assumptions explicitly listed.

### Referenced By Agents
- (global or builtin)

### Implementation Reference
- `agents/arbitrator/skills/render-verdict.ts`

### Implementation Notes
- If this skill has executable implementation in `agents/*/skills/*.ts`, keep behavior aligned with that code path.
- Treat this SKILL.md as the unified instruction source for prompt injection.
