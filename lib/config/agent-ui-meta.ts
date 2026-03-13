/**
 * Client-safe UI metadata for agents.
 *
 * This file has ZERO server-only dependencies (no fs, no prompt modules)
 * so it can be safely imported in "use client" components.
 *
 * Sprint 13: Consolidated to 8 core agents.
 */

export interface AgentUIMeta {
  label: string;
  emoji: string;
  color: string;          // Tailwind bg class, e.g. "bg-green-500"
  borderColor: string;    // Tailwind border-b class for card bottom accent
  badgeClass: string;     // Badge variant classes
  stepCardClass: string;  // AgentStepCard border + text classes
  stage: 'meta' | 'prepare' | 'plan' | 'implement' | 'deploy';
  stageOrder: number;     // display order within the stage
}

export const BUILTIN_AGENT_UI: Record<string, AgentUIMeta> = {
  // --- RebuilD (primary agent) ---
  rebuild: {
    label: 'RD',
    emoji: '\u{1F528}',
    color: 'bg-emerald-600',
    borderColor: 'border-emerald-600',
    badgeClass: 'bg-emerald-600/20 text-emerald-400',
    stepCardClass: 'border-l-emerald-600 text-emerald-400',
    stage: 'meta',
    stageOrder: 0,
  },
  // --- Legacy agents (kept for backward compatibility with existing logs) ---
  'chat-assistant': {
    label: 'CA',
    emoji: '\u{1F4AC}',
    color: 'bg-blue-500',
    borderColor: 'border-blue-500',
    badgeClass: 'bg-blue-500/20 text-blue-400',
    stepCardClass: 'border-l-blue-500 text-blue-400',
    stage: 'meta',
    stageOrder: 1,
  },
  'decision-maker': {
    label: 'DM',
    emoji: '\u{1F9E0}',
    color: 'bg-violet-500',
    borderColor: 'border-violet-500',
    badgeClass: 'bg-violet-500/20 text-violet-400',
    stepCardClass: 'border-l-violet-500 text-violet-400',
    stage: 'meta',
    stageOrder: 1,
  },
  architect: {
    label: 'AC',
    emoji: '\u{1F3D7}\u{FE0F}',
    color: 'bg-fuchsia-500',
    borderColor: 'border-fuchsia-500',
    badgeClass: 'bg-fuchsia-500/20 text-fuchsia-400',
    stepCardClass: 'border-l-fuchsia-500 text-fuchsia-400',
    stage: 'meta',
    stageOrder: 2,
  },
  'chat-judge': {
    label: 'CJ',
    emoji: '\u{2696}\u{FE0F}',
    color: 'bg-gray-500',
    borderColor: 'border-gray-500',
    badgeClass: 'bg-gray-500/20 text-gray-400',
    stepCardClass: 'border-l-gray-500 text-gray-400',
    stage: 'meta',
    stageOrder: 3,
  },
  planner: {
    label: 'PL',
    emoji: '\u{1F4CB}',
    color: 'bg-indigo-500',
    borderColor: 'border-indigo-500',
    badgeClass: 'bg-indigo-500/20 text-indigo-400',
    stepCardClass: 'border-l-indigo-500 text-indigo-400',
    stage: 'plan',
    stageOrder: 1,
  },
  developer: {
    label: 'DEV',
    emoji: '\u{1F4BB}',
    color: 'bg-cyan-500',
    borderColor: 'border-cyan-500',
    badgeClass: 'bg-cyan-500/20 text-cyan-400',
    stepCardClass: 'border-l-cyan-500 text-cyan-400',
    stage: 'implement',
    stageOrder: 1,
  },
  reviewer: {
    label: 'RV',
    emoji: '\u{1F440}',
    color: 'bg-orange-500',
    borderColor: 'border-orange-500',
    badgeClass: 'bg-orange-500/20 text-orange-400',
    stepCardClass: 'border-l-orange-500 text-orange-400',
    stage: 'implement',
    stageOrder: 2,
  },
  deployer: {
    label: 'DP',
    emoji: '\u{1F680}',
    color: 'bg-emerald-500',
    borderColor: 'border-emerald-500',
    badgeClass: 'bg-emerald-500/20 text-emerald-400',
    stepCardClass: 'border-l-emerald-500 text-emerald-400',
    stage: 'deploy',
    stageOrder: 1,
  },
};

/**
 * Normalize underscore/alias names to canonical id.
 * Includes backward compatibility for all 11 merged agents.
 */
export const AGENT_ALIASES: Record<string, string> = {
  // All legacy agents now route to RebuilD in UI
  'chat-assistant': 'rebuild',
  'decision-maker': 'rebuild',
  architect: 'rebuild',
  'chat-judge': 'rebuild',
  planner: 'rebuild',
  developer: 'rebuild',
  reviewer: 'rebuild',
  deployer: 'rebuild',

  // Legacy sub-agent aliases
  product_manager: 'rebuild',
  pm: 'rebuild',
  tech_lead: 'rebuild',
  'tech-lead': 'rebuild',
  orchestrator: 'rebuild',
  analyst: 'rebuild',
  researcher: 'rebuild',
  blue_team: 'rebuild',
  'blue-team': 'rebuild',
  critic: 'rebuild',
  arbitrator: 'rebuild',
  knowledge_curator: 'rebuild',
  'knowledge-curator': 'rebuild',
  qa_engineer: 'rebuild',
  'qa-engineer': 'rebuild',
  code_reviewer: 'rebuild',
  'code-reviewer': 'rebuild',
  supervisor: 'rebuild',
  complexity_assessor: 'rebuild',
  'complexity-assessor': 'rebuild',
};

/** Default UI style for AI-generated (dynamic) agents. */
const AI_GENERATED_UI: AgentUIMeta = {
  label: 'AI',
  emoji: '\u2728',
  color: 'bg-violet-500',
  borderColor: 'border-violet-500',
  badgeClass: 'bg-violet-500/20 text-violet-400',
  stepCardClass: 'border-l-violet-500 text-violet-400',
  stage: 'implement',
  stageOrder: 99,
};

function resolveId(id: string): string {
  return AGENT_ALIASES[id] || id;
}

export function getAgentUI(id: string): AgentUIMeta | undefined {
  const resolved = resolveId(id);
  if (BUILTIN_AGENT_UI[resolved]) return BUILTIN_AGENT_UI[resolved];
  if (resolved.startsWith('dynamic-')) return AI_GENERATED_UI;
  return undefined;
}

export function getAgentUIByStage(stage: AgentUIMeta['stage']): { name: string; ui: AgentUIMeta }[] {
  return Object.entries(BUILTIN_AGENT_UI)
    .filter(([, ui]) => ui.stage === stage)
    .sort((a, b) => a[1].stageOrder - b[1].stageOrder)
    .map(([name, ui]) => ({ name, ui }));
}
