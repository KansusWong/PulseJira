<!-- sync-skill-md:managed -->
---
name: build-case
description: 构建 STAR 框架论证方案
version: 1.0.0
requires:
  tools: []
tags: [builtin-agents]
---
## Instructions

### Purpose
构建 STAR 框架论证方案

### Activation
- Activate when task context requires `build-case`.
- Prioritize existing project conventions and agent role boundaries.

### Workflow
1. Analyze the user goal and expected output.
2. Produce a concise, structured plan before execution.
3. Execute with clear validation and failure handling.
4. Return actionable output with assumptions explicitly listed.

### Referenced By Agents
- (global or builtin)

### Implementation Reference
- `agents/blue-team/skills/build-case.ts`

### Implementation Notes
- If this skill has executable implementation in `agents/*/skills/*.ts`, keep behavior aligned with that code path.
- Treat this SKILL.md as the unified instruction source for prompt injection.
