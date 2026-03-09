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
  analyst: {
    label: 'AN',
    emoji: '\u{1F50D}',
    color: 'bg-green-500',
    borderColor: 'border-green-500',
    badgeClass: 'bg-green-500/20 text-green-400',
    stepCardClass: 'border-l-green-500 text-green-400',
    stage: 'prepare',
    stageOrder: 1,
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
  // Planner aliases (merged pm + tech-lead + orchestrator)
  product_manager: 'planner',
  pm: 'planner',
  tech_lead: 'planner',
  'tech-lead': 'planner',
  orchestrator: 'planner',

  // Analyst aliases (merged researcher + blue-team + critic + arbitrator + knowledge-curator)
  researcher: 'analyst',
  blue_team: 'analyst',
  'blue-team': 'analyst',
  critic: 'analyst',
  arbitrator: 'analyst',
  knowledge_curator: 'analyst',
  'knowledge-curator': 'analyst',

  // Reviewer aliases (merged qa-engineer + code-reviewer + supervisor)
  qa_engineer: 'reviewer',
  'qa-engineer': 'reviewer',
  code_reviewer: 'reviewer',
  'code-reviewer': 'reviewer',
  supervisor: 'reviewer',

  // Chat Judge aliases
  complexity_assessor: 'chat-judge',
  'complexity-assessor': 'chat-judge',
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
