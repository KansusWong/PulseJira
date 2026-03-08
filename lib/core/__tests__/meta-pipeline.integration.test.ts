/**
 * Integration tests for the meta-pipeline orchestration chain.
 *
 * Mocks the LLM pool layer so that agent factories (createDecisionMakerAgent,
 * createArchitectAgent) receive a scripted mock OpenAI client. All DB calls
 * are mocked to no-ops. Blackboard is real (in-memory Map) with DB persistence
 * mocked out.
 *
 * Test scope: Decision Maker → Architect chain via runMetaPipeline().
 */

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports
// ---------------------------------------------------------------------------

jest.mock('@/lib/services/llm-pool');
jest.mock('@/lib/db/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ select: jest.fn(() => ({ data: [], error: null })) })),
      upsert: jest.fn(() => ({ data: [], error: null })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ order: jest.fn(() => ({ data: [], error: null })) })),
      })),
    })),
  },
  supabaseConfigured: false,
  assertSupabase: jest.fn(),
  reinitializeSupabase: jest.fn(),
}));
jest.mock('@/lib/services/usage', () => ({
  recordLlmUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/services/llm-failover-events', () => ({
  recordLlmFailoverEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/config/agent-config', () => ({
  loadAgentConfig: jest.fn(() => ({})),
  getAgentConfig: jest.fn(() => ({})),
}));
jest.mock('@/lib/skills/agent-skill-runtime', () => ({
  buildSkillPromptForAgent: jest.fn(() => ''),
}));
jest.mock('@/lib/tools/create-agent', () => ({
  CreateAgentTool: jest.fn().mockImplementation(() => ({
    name: 'create_agent',
    description: 'mock',
    toFunctionDef: () => ({ type: 'function', function: { name: 'create_agent', parameters: { type: 'object', properties: {} } } }),
    execute: jest.fn().mockResolvedValue({ success: true, data: {} }),
  })),
  getAllDynamicAgents: jest.fn(() => []),
  removeDynamicAgent: jest.fn(),
  getDynamicAgent: jest.fn(),
}));
jest.mock('@/lib/tools/create-skill', () => ({
  CreateSkillTool: jest.fn().mockImplementation(() => ({
    name: 'create_skill',
    description: 'mock',
    toFunctionDef: () => ({ type: 'function', function: { name: 'create_skill', parameters: { type: 'object', properties: {} } } }),
    execute: jest.fn().mockResolvedValue({ success: true, data: {} }),
  })),
  getAllDynamicSkills: jest.fn(() => []),
  removeDynamicSkill: jest.fn(),
  getDynamicSkill: jest.fn(),
}));
jest.mock('@/connectors/bus/message-bus', () => ({
  messageBus: {
    publish: jest.fn(),
    createLogger: jest.fn(() => async () => {}),
    withScope: jest.fn((_scope: any, fn: () => any) => fn()),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));

// Mock tool modules that agent factories import
const mockToolDef = (name: string) => ({
  name,
  description: `mock ${name}`,
  toFunctionDef: () => ({ type: 'function', function: { name, parameters: { type: 'object', properties: {} } } }),
  execute: jest.fn().mockResolvedValue({ success: true, data: 'ok' }),
});

jest.mock('@/tools', () => ({
  getTools: jest.fn((...names: string[]) => names.map((n: string) => mockToolDef(n))),
  getTool: jest.fn((name: string) => mockToolDef(name)),
  registerTool: jest.fn(),
  getToolNames: jest.fn(() => []),
  isToolRegistered: jest.fn(() => false),
}));

jest.mock('@/lib/tools/spawn-agent', () => {
  const factories = new Map();
  return {
    registerAgentFactory: jest.fn((id: string, factory: any) => { factories.set(id, factory); }),
    deregisterAgentFactory: jest.fn(),
    SpawnAgentTool: jest.fn().mockImplementation(() => mockToolDef('spawn_agent')),
    __factories: factories,
  };
});
jest.mock('@/lib/tools/list-agents', () => ({
  ListAgentsTool: jest.fn().mockImplementation(() => mockToolDef('list_agents')),
}));
jest.mock('@/lib/tools/finish-decision', () => ({
  FinishDecisionTool: jest.fn().mockImplementation(() => mockToolDef('finish_decision')),
}));
jest.mock('@/lib/tools/finish-architect', () => ({
  FinishArchitectTool: jest.fn().mockImplementation(() => mockToolDef('finish_architect')),
}));
jest.mock('@/lib/tools/persist-agent', () => ({
  PersistAgentTool: jest.fn().mockImplementation(() => mockToolDef('persist_agent')),
}));
jest.mock('@/lib/tools/persist-skill', () => ({
  PersistSkillTool: jest.fn().mockImplementation(() => mockToolDef('persist_skill')),
}));
jest.mock('@/lib/tools/promote-feature', () => ({
  PromoteFeatureTool: jest.fn().mockImplementation(() => mockToolDef('promote_feature')),
}));
jest.mock('@/lib/tools/validate-output', () => ({
  ValidateOutputTool: jest.fn().mockImplementation(() => mockToolDef('validate_output')),
}));
jest.mock('@/lib/tools/discover-skills', () => ({
  DiscoverSkillsTool: jest.fn().mockImplementation(() => mockToolDef('discover_skills')),
}));
jest.mock('@/lib/tools/blackboard-read', () => ({
  BlackboardReadTool: jest.fn().mockImplementation(() => mockToolDef('blackboard_read')),
}));
jest.mock('@/lib/tools/blackboard-write', () => ({
  BlackboardWriteTool: jest.fn().mockImplementation(() => mockToolDef('blackboard_write')),
}));
jest.mock('@/lib/prompts/decision-maker', () => ({
  DECISION_MAKER_PROMPT: 'You are a decision maker.',
}));
jest.mock('@/lib/prompts/architect', () => ({
  ARCHITECT_PROMPT: 'You are an architect.',
}));
jest.mock('@/agents/utils', () => ({
  loadSoul: jest.fn(() => ''),
  mergeSoulWithPrompt: jest.fn((_soul: string, prompt: string) => prompt),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createMockOpenAIClient, buildToolCallResponse } from './helpers/mock-openai-client';
import type { MockChatResponse } from './helpers/mock-openai-client';
import {
  VALID_DM_PROCEED,
  VALID_DM_HALT,
  INVALID_DM_OUTPUT,
  VALID_ARCHITECT_RESULT,
  TEST_PROJECT,
} from './helpers/fixtures';
import { runDecisionPhase, runArchitectPhase, runMetaPipeline } from '@/skills/meta-pipeline';
import { Blackboard } from '@/lib/blackboard/blackboard';
import { getLLMPool } from '@/lib/services/llm-pool';
import { getAllDynamicAgents } from '@/lib/tools/create-agent';
import { getAllDynamicSkills } from '@/lib/tools/create-skill';

// ---------------------------------------------------------------------------
// Mock wiring
// ---------------------------------------------------------------------------

const mockedGetLLMPool = getLLMPool as jest.MockedFunction<typeof getLLMPool>;
const mockedGetAllDynamicAgents = getAllDynamicAgents as jest.MockedFunction<typeof getAllDynamicAgents>;
const mockedGetAllDynamicSkills = getAllDynamicSkills as jest.MockedFunction<typeof getAllDynamicSkills>;

/** Install a mock OpenAI client into the LLM pool for the duration of a test. */
function installMockClient(responseQueue: MockChatResponse[]) {
  const mockClient = createMockOpenAIClient(responseQueue);

  const resolved = {
    client: mockClient,
    accountId: 'test-account',
    accountName: 'Test Account',
    provider: 'openai',
    model: 'gpt-4o',
  };

  const mockPool = {
    getClientOrFallback: jest.fn(() => resolved),
    getFailoverChain: jest.fn(() => [resolved]),
    getClient: jest.fn(() => resolved),
    markAccountFailure: jest.fn(),
    markAccountSuccess: jest.fn(),
    getStrategy: jest.fn(() => 'priority' as const),
    getAccounts: jest.fn(() => []),
    getRuntimeConfig: jest.fn(() => ({
      failureThreshold: 2,
      cooldownMs: 300000,
      failoverPolicy: {
        failoverOnTimeout: true,
        failoverOnServerError: true,
        failoverOnModelNotFound: true,
      },
    })),
    getHealthStatus: jest.fn(() => []),
    reload: jest.fn(),
  };

  mockedGetLLMPool.mockReturnValue(mockPool as any);

  return { mockClient, mockPool };
}

// Silence console output during tests
const silentLogger = async () => {};

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Default mock for dynamic agent/skill cleanup
  mockedGetAllDynamicAgents.mockReturnValue([]);
  mockedGetAllDynamicSkills.mockReturnValue([]);
});

// =========================================================================
// Tests: runDecisionPhase
// =========================================================================

describe('runDecisionPhase', () => {
  it('returns PROCEED when DM calls finish_decision with valid PROCEED payload', async () => {
    const { mockClient } = installMockClient([
      buildToolCallResponse('finish_decision', VALID_DM_PROCEED),
    ]);

    const result = await runDecisionPhase('Build a new feature', {
      projectId: TEST_PROJECT.id,
      logger: silentLogger,
    });

    expect(result.decision).toBe('PROCEED');
    expect(result.confidence).toBe(VALID_DM_PROCEED.confidence);
    expect(result.summary).toBe(VALID_DM_PROCEED.summary);
    expect(result.risk_level).toBe('low');
    expect(result.sources).toHaveLength(1);
    expect(result.recommended_actions).toEqual(VALID_DM_PROCEED.recommended_actions);

    // Verify the mock client was called
    expect(mockClient.chat.completions.create).toHaveBeenCalled();
  });

  it('returns HALT when DM calls finish_decision with HALT payload', async () => {
    installMockClient([
      buildToolCallResponse('finish_decision', VALID_DM_HALT),
    ]);

    const result = await runDecisionPhase('Vague idea', {
      logger: silentLogger,
    });

    expect(result.decision).toBe('HALT');
    expect(result.confidence).toBe(VALID_DM_HALT.confidence);
    expect(result.risk_level).toBe('high');
  });

  it('degrades to HALT when DM returns invalid output', async () => {
    installMockClient([
      buildToolCallResponse('finish_decision', INVALID_DM_OUTPUT as any),
    ]);

    const logMessages: string[] = [];
    const capturingLogger = async (msg: string) => { logMessages.push(msg); };

    const result = await runDecisionPhase('Broken input', {
      logger: capturingLogger,
    });

    // Should degrade to HALT
    expect(result.decision).toBe('HALT');
    expect(result.confidence).toBe(0);
    expect(result.risk_level).toBe('critical');
    expect(result.risk_factors).toContain('Agent output did not match expected schema');

    // Logger should have recorded the validation failure
    const validationLog = logMessages.find(m => m.includes('validation failed'));
    expect(validationLog).toBeDefined();
  });
});

// =========================================================================
// Tests: runArchitectPhase
// =========================================================================

describe('runArchitectPhase', () => {
  it('returns parsed architect output on happy path', async () => {
    // Payload matches the Zod ArchitectResultSchema (uses output_summary, not output)
    const architectPayload = {
      summary: VALID_ARCHITECT_RESULT.summary,
      execution_trace: [
        {
          step_id: 'step-1',
          action: 'spawn_agent',
          agent_or_tool: 'developer',
          status: 'completed',
          output_summary: 'Created API scaffolding',
        },
      ],
      final_output: VALID_ARCHITECT_RESULT.final_output,
      steps_completed: VALID_ARCHITECT_RESULT.steps_completed,
      steps_failed: VALID_ARCHITECT_RESULT.steps_failed,
      steps_retried: VALID_ARCHITECT_RESULT.steps_retried,
      created_agents: [],
      created_skills: [],
    };

    installMockClient([
      buildToolCallResponse('finish_architect', architectPayload),
    ]);

    const result = await runArchitectPhase(
      'Build a REST API',
      VALID_DM_PROCEED,
      { logger: silentLogger },
    );

    expect(result.summary).toBe(VALID_ARCHITECT_RESULT.summary);
    expect(result.steps_completed).toBe(1);
    expect(result.steps_failed).toBe(0);
    expect(result.execution_trace).toHaveLength(1);
    expect((result.execution_trace[0] as any).step_id).toBe('step-1');
  });
});

// =========================================================================
// Tests: runMetaPipeline
// =========================================================================

describe('runMetaPipeline', () => {
  it('executes full DM→Architect chain when DM returns PROCEED', async () => {
    const architectPayload = {
      summary: 'Full pipeline architecture result',
      execution_trace: [
        {
          step_id: 'step-1',
          action: 'use_tool',
          agent_or_tool: 'code_write',
          status: 'completed',
          output_summary: 'Created initial code',
        },
      ],
      final_output: { done: true },
      steps_completed: 1,
      steps_failed: 0,
      steps_retried: 0,
      created_agents: [],
      created_skills: [],
    };

    installMockClient([
      // DM call → PROCEED
      buildToolCallResponse('finish_decision', VALID_DM_PROCEED),
      // Architect call → result
      buildToolCallResponse('finish_architect', architectPayload),
    ]);

    const result = await runMetaPipeline('Build a new widget', {
      projectId: TEST_PROJECT.id,
      logger: silentLogger,
    });

    expect(result.skippedDecision).toBe(false);
    expect(result.decision).toBeDefined();
    expect(result.decision!.decision).toBe('PROCEED');
    expect(result.architect).toBeDefined();
    expect(result.architect!.summary).toBe('Full pipeline architecture result');
    expect(result.architect!.steps_completed).toBe(1);
  });

  it('stops after DM when decision is HALT', async () => {
    const { mockClient } = installMockClient([
      buildToolCallResponse('finish_decision', VALID_DM_HALT),
      // Should NOT be consumed — architect never runs
      buildToolCallResponse('finish_architect', VALID_ARCHITECT_RESULT),
    ]);

    const result = await runMetaPipeline('Unclear requirement', {
      logger: silentLogger,
    });

    expect(result.skippedDecision).toBe(false);
    expect(result.decision!.decision).toBe('HALT');
    expect(result.architect).toBeUndefined();

    // Only the DM call should have been made (1 call, not 2)
    expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('bypasses DM when skipDecision=true', async () => {
    const architectPayload = {
      summary: 'Direct architect result',
      execution_trace: [],
      final_output: null,
      steps_completed: 0,
      steps_failed: 0,
      steps_retried: 0,
      created_agents: [],
      created_skills: [],
    };

    const { mockClient } = installMockClient([
      // Only architect call — no DM
      buildToolCallResponse('finish_architect', architectPayload),
    ]);

    const result = await runMetaPipeline('Direct request', {
      skipDecision: true,
      logger: silentLogger,
    });

    expect(result.skippedDecision).toBe(true);
    expect(result.decision).toBeUndefined();
    expect(result.architect).toBeDefined();
    expect(result.architect!.summary).toBe('Direct architect result');

    // Only 1 call — DM was skipped
    expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('propagates blackboard state across DM and Architect phases', async () => {
    const bb = new Blackboard('test-exec-001', TEST_PROJECT.id);

    // Pre-write a value to the blackboard
    await bb.write({
      key: 'test.pre-seeded',
      value: 'This value was seeded before the pipeline',
      type: 'context',
      author: 'test-setup',
      tags: ['test'],
    });

    const architectPayload = {
      summary: 'Architecture with blackboard context',
      execution_trace: [],
      final_output: null,
      steps_completed: 0,
      steps_failed: 0,
      steps_retried: 0,
      created_agents: [],
      created_skills: [],
    };

    installMockClient([
      buildToolCallResponse('finish_decision', VALID_DM_PROCEED),
      buildToolCallResponse('finish_architect', architectPayload),
    ]);

    const result = await runMetaPipeline('Build with context', {
      projectId: TEST_PROJECT.id,
      blackboard: bb,
      logger: silentLogger,
    });

    // Pipeline should have completed
    expect(result.decision!.decision).toBe('PROCEED');
    expect(result.architect).toBeDefined();

    // Blackboard should contain pre-seeded value
    const preSeeded = bb.read('test.pre-seeded');
    expect(preSeeded).toBeDefined();
    expect(preSeeded!.value).toBe('This value was seeded before the pipeline');

    // runDecisionPhase writes 'pipeline.requirements' to blackboard
    const requirements = bb.read('pipeline.requirements');
    expect(requirements).toBeDefined();
    expect(requirements!.author).toBe('meta-pipeline');

    // runDecisionPhase also writes 'dm.decision' to blackboard
    const dmDecision = bb.read('dm.decision');
    expect(dmDecision).toBeDefined();
    expect((dmDecision!.value as any).decision).toBe('PROCEED');

    // Blackboard size should include pre-seeded + pipeline.requirements + dm.decision
    expect(bb.size).toBeGreaterThanOrEqual(3);
  });
});
