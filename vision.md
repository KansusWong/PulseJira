# Product Vision: RebuilD

**Core Philosophy:**
We build tools for high-performance teams who hate waiting. Speed is our feature. 
We don't do "process" for the sake of process. We enable flow.

**Our Principles:**
1. **Don't Make Me Think:** UI should be intuitive, invisible, and anticipate needs.
2. **Speed is King:** < 100ms interaction time for everything.
3. **Automate the Boring:** If a machine can do it, a human shouldn't.
4. **Ruthless Prioritization:** We only build features that move the needle. 
5. **Dark Mode First:** Designed for developers who work late.

**What we are NOT:**
- We are not a bloated enterprise ticket system (like old Jira).
- We are not a playful, colorful toy (like Trello).
- We are a serious tool for serious builders.

**Our Sixth Principle:**
6. **Trust is Earned:** AI autonomy must be gradual. Full automation is the destination, not the starting point. Every critical action needs a human checkpoint until the system proves itself.

**What we are building toward:**
- Phase 1: A system humans can trust (secure, controllable, recoverable)
- Phase 2: A system humans want to use (observable, integrated, cost-efficient)
- Phase 3: A system that makes humans optional (multimodal, extensible, templated)

**Acceptance Criteria for New Features:**
- Must reduce friction.
- Must be automatable.
- Must fit into our "Pitch Black" aesthetic.
- If it's just "nice to have", kill it.

---

## Evolution Roadmap

> Informed by competitive analysis against CodePilot (Claude Agent SDK GUI client) and production readiness audit. RebuilD's moat is multi-agent orchestration — not client features. The roadmap prioritizes making the agent system reliable, controllable, and observable before adding surface-level capabilities.

### Phase 1 — Trustworthy (能用)

**Goal:** Make the system deployable and trustworthy. No team will adopt a tool that's insecure, unrecoverable, or fully autonomous from day one.

| Capability | Why It's Blocking | Priority |
|-----------|-------------------|----------|
| **Authentication & RBAC** | All 34 API endpoints are unauthenticated. Anyone can trigger `run_command` via `POST /api/meta`. This is a P0 security gap (OPT-01). | P0 |
| **Human-in-the-Loop Checkpoints** | Agent pipelines execute autonomously — write code, create PRs, deploy to production — with zero human approval. Teams won't trust this. Configurable approval gates at Decision Maker output and pre-Deploy are essential. | P0 |
| **Pipeline Checkpoint & Resume** | A 30-minute Meta Pipeline (DM 15 rounds + Architect 30 rounds) can fail at any point — API rate limits, network errors, Vercel timeout (OPT-13). Without checkpoints, all tokens and time are wasted. Persist state after each stage; resume from last successful checkpoint. | P0 |

### Phase 2 — Usable (好用)

**Goal:** Make the system efficient, observable, and integrated into team workflows.

| Capability | Why It Matters | Priority |
|-----------|---------------|----------|
| **Multi-Model per Agent** | All 15 agents use the same model. Knowledge Curator doesn't need GPT-4o; Arbitrator (single-shot, no tools) can use a cheaper model. Per-agent model config reduces cost 40-60% without quality loss. | P1 |
| **Execution Observability** | SSE streams events but doesn't persist them. After a pipeline completes, there's no way to review what happened, which agent failed, how many tokens were spent, or why a decision was made. Need: execution trace persistence, cost dashboard, agent timeline. (OPT-24) | P1 |
| **Webhook Notifications** | Pipeline completion, PR creation, deploy failure — none of these notify the team. Single-direction webhooks to Feishu/DingTalk/Slack cover 90% of notification needs without building full IM bridges. | P1 |

### Phase 3 — Powerful (强大)

**Goal:** Expand input/output capabilities and enable team-level knowledge sharing.

| Capability | Why It Adds Value | Priority |
|-----------|------------------|----------|
| **Multimodal Input** | PMs want to attach competitor screenshots, design mockups, user feedback images. Currently text-only signal input loses visual information. Support image upload → base64 → Vision model. | P2 |
| **Team Skill Library** | Skills are local SKILL.md files with no sharing mechanism. A team-internal skill repository (not a public marketplace) enables workflow reuse across members. | P2 |
| **Pipeline Templates** | Common workflows (bug triage, feature evaluation, tech debt cleanup) should be one-click presets, not manual configuration each time. | P2 |

### What We Will NOT Build

| Capability | Reason |
|-----------|--------|
| MCP Server integration | Anthropic-ecosystem protocol. We use OpenAI and have our own Tool Registry. |
| Image generation | Not relevant to project management. Stays out of scope. |
| Full IM bridging (bidirectional) | Our agents run as background pipelines, not interactive chat. One-way webhooks are sufficient. |
| Public skill marketplace | User base doesn't justify marketplace economics. Team-internal sharing is enough. |
