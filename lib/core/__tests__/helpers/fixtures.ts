/**
 * Pre-built test payloads matching Zod schemas in meta-pipeline.ts.
 */

import type { DecisionOutput, ArchitectResult } from '@/lib/core/types';

// ---------------------------------------------------------------------------
// Decision Maker payloads
// ---------------------------------------------------------------------------

/** Valid PROCEED decision — passes DecisionOutputSchema. */
export const VALID_DM_PROCEED: DecisionOutput = {
  decision: 'PROCEED',
  confidence: 0.92,
  summary: 'Market conditions are favorable for proceeding.',
  rationale: 'Multiple signals indicate strong demand with low risk.',
  risk_level: 'low',
  risk_factors: ['Minor competitive pressure'],
  sources: [
    { type: 'rag', name: 'market-report', summary: 'Positive trend detected', confidence: 0.9 },
  ],
  recommended_actions: ['Begin architecture phase', 'Assign resources'],
  aggregated_signals: ['signal-001'],
};

/** Valid HALT decision — passes DecisionOutputSchema. */
export const VALID_DM_HALT: DecisionOutput = {
  decision: 'HALT',
  confidence: 0.85,
  summary: 'Requirements are too vague to proceed.',
  rationale: 'Insufficient clarity on scope and constraints.',
  risk_level: 'high',
  risk_factors: ['Unclear scope', 'No budget defined'],
  sources: [],
  recommended_actions: ['Gather more requirements'],
};

/** Invalid DM output — missing required fields, should degrade to HALT. */
export const INVALID_DM_OUTPUT = {
  decision: 'MAYBE',
  confidence: 'not-a-number',
} as unknown as DecisionOutput;

// ---------------------------------------------------------------------------
// Architect payloads
// ---------------------------------------------------------------------------

/** Valid architect result — passes ArchitectResultSchema. */
export const VALID_ARCHITECT_RESULT: ArchitectResult = {
  summary: 'Architecture designed with microservice pattern.',
  execution_trace: [
    {
      step_id: 'step-1',
      action: 'spawn_agent',
      agent_or_tool: 'developer',
      status: 'completed',
      output: 'Created API scaffolding',
      retry_count: 0,
    },
  ],
  final_output: { architecture: 'microservice', stack: ['Node.js', 'PostgreSQL'] },
  steps_completed: 1,
  steps_failed: 0,
  steps_retried: 0,
  created_agents: [],
  created_skills: [],
};

/** Invalid architect output — garbage data, should use safe defaults. */
export const INVALID_ARCHITECT_OUTPUT = {
  summary: 42,
  execution_trace: 'not-an-array',
} as unknown as ArchitectResult;

// ---------------------------------------------------------------------------
// Project fixture
// ---------------------------------------------------------------------------

export const TEST_PROJECT = {
  id: 'proj-test-001',
  name: 'Test Project',
  description: 'A minimal project fixture for integration tests.',
};
