/**
 * Agent Consolidation Tests — Sprint 13
 *
 * Verifies:
 * 1. Planner agent: 3 modes (prd, task-plan, implementation-dag)
 * 2. Analyst agent: 5 modes (research, advocate, critique, arbitrate, retrieve)
 * 3. Reviewer agent: 3 modes (qa, review, supervise)
 * 4. Chat Judge: registration and assessComplexity
 * 5. AGENT_ALIASES backward compatibility
 * 6. Agent UI meta for 8 core agents
 */

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports
// ---------------------------------------------------------------------------

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
const mockOpenAIClient = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{ message: { content: '{}', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    },
  },
};
const mockPoolResolved = {
  client: mockOpenAIClient,
  accountId: 'test-account',
  accountName: 'Test Account',
  provider: 'openai',
  model: 'gpt-4o',
};
const mockPool = {
  getClientOrFallback: jest.fn(() => mockPoolResolved),
  getFailoverChain: jest.fn(() => [mockPoolResolved]),
  getClient: jest.fn(() => mockPoolResolved),
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
jest.mock('@/lib/services/llm-pool', () => ({
  getLLMPool: jest.fn(() => mockPool),
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
jest.mock('@/lib/config/agent-templates', () => ({
  getTemplate: jest.fn(() => null),
  resolvePromptTemplate: jest.fn((_t: string, _v: any) => ''),
}));
jest.mock('@/lib/skills/agent-skill-runtime', () => ({
  buildSkillPromptForAgent: jest.fn(() => ''),
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

// Mock tool factory
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
    hasAgentFactory: jest.fn((id: string) => factories.has(id)),
    SpawnAgentTool: jest.fn().mockImplementation(() => mockToolDef('spawn_agent')),
    __factories: factories,
  };
});

// Mock retrieval tools used by analyst retrieve mode
jest.mock('@/lib/tools/search-vision-knowledge', () => ({
  SearchVisionKnowledgeTool: jest.fn().mockImplementation(() => mockToolDef('search_vision_knowledge')),
}));
jest.mock('@/lib/tools/search-decisions', () => ({
  SearchDecisionsTool: jest.fn().mockImplementation(() => mockToolDef('search_decisions')),
}));
jest.mock('@/lib/tools/search-code-artifacts', () => ({
  SearchCodeArtifactsTool: jest.fn().mockImplementation(() => mockToolDef('search_code_artifacts')),
}));
jest.mock('@/lib/tools/search-code-patterns', () => ({
  SearchCodePatternsTool: jest.fn().mockImplementation(() => mockToolDef('search_code_patterns')),
}));
jest.mock('@/lib/tools/finish-retrieval', () => ({
  FinishRetrievalTool: jest.fn().mockImplementation(() => mockToolDef('finish_retrieval')),
}));
jest.mock('@/lib/tools/validate-output', () => ({
  ValidateOutputTool: jest.fn().mockImplementation(() => mockToolDef('validate_output')),
}));

jest.mock('@/agents/utils', () => ({
  loadSoul: jest.fn(() => ''),
  mergeSoulWithPrompt: jest.fn((_soul: string, prompt: string) => prompt),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createPlannerAgent } from '@/agents/planner';
import { createAnalystAgent } from '@/agents/analyst';
import { createReviewerAgent } from '@/agents/reviewer';
import { createChatJudgeAgent } from '@/agents/chat-judge';
import { BUILTIN_AGENT_UI, AGENT_ALIASES, getAgentUI } from '@/lib/config/agent-ui-meta';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Planner Agent', () => {
  it('creates agent in prd mode (single-shot, no tools)', () => {
    const agent = createPlannerAgent({ mode: 'prd' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('planner');
    // prd mode = single-shot → no tools, no exitToolName
    expect((agent as any).config.tools?.length ?? 0).toBe(0);
  });

  it('creates agent in task-plan mode with tools', () => {
    const agent = createPlannerAgent({ mode: 'task-plan' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('planner');
    expect((agent as any).config.exitToolName).toBe('finish_planning');
    expect((agent as any).config.maxLoops).toBe(15);
  });

  it('creates agent in implementation-dag mode with extended tools', () => {
    const agent = createPlannerAgent({ mode: 'implementation-dag' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('planner');
    expect((agent as any).config.exitToolName).toBe('finish_planning');
    expect((agent as any).config.maxLoops).toBe(25);
  });

  it('defaults to implementation-dag mode when no mode specified', () => {
    const agent = createPlannerAgent();
    expect(agent).toBeDefined();
    expect((agent as any).config.maxLoops).toBe(25);
  });

  it('supports extra tools injection in implementation-dag mode', () => {
    const extraTool = mockToolDef('custom_tool') as any;
    const agent = createPlannerAgent({ mode: 'implementation-dag', extraTools: [extraTool] });
    expect(agent).toBeDefined();
    // base tools (4) + 1 extra
    const toolCount = (agent as any).config.tools?.length ?? 0;
    expect(toolCount).toBeGreaterThan(4);
  });
});

describe('Analyst Agent', () => {
  it('creates agent in research mode', () => {
    const agent = createAnalystAgent({ mode: 'research' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('analyst');
    expect((agent as any).config.maxLoops).toBe(5);
  });

  it('creates agent in advocate mode (single-shot)', () => {
    const agent = createAnalystAgent({ mode: 'advocate' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('analyst');
    expect((agent as any).config.tools?.length ?? 0).toBe(0);
  });

  it('creates agent in critique mode with web_search', () => {
    const agent = createAnalystAgent({ mode: 'critique' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('analyst');
    expect((agent as any).config.maxLoops).toBe(10);
  });

  it('critique mode accepts client/poolTags for red-team LLM', () => {
    const explicitClient = { chat: { completions: { create: jest.fn() } } } as any;
    const agent = createAnalystAgent({
      mode: 'critique',
      client: explicitClient,
      poolTags: ['red-team'],
      accountId: 'backup-1',
      accountName: 'Backup Account',
    });
    expect(agent).toBeDefined();
    // When explicit client is provided, BaseAgent stores it and uses explicit mode
    expect((agent as any).useExplicitClient).toBe(true);
  });

  it('creates agent in arbitrate mode (single-shot)', () => {
    const agent = createAnalystAgent({ mode: 'arbitrate' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('analyst');
    expect((agent as any).config.tools?.length ?? 0).toBe(0);
  });

  it('creates agent in retrieve mode with retrieval tools', () => {
    const agent = createAnalystAgent({ mode: 'retrieve' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('analyst');
    expect((agent as any).config.exitToolName).toBe('finish_retrieval');
    expect((agent as any).config.maxLoops).toBe(8);
    // Should have 5 retrieval tools
    const toolCount = (agent as any).config.tools?.length ?? 0;
    expect(toolCount).toBe(5);
  });

  it('defaults to research mode when no mode specified', () => {
    const agent = createAnalystAgent();
    expect(agent).toBeDefined();
    expect((agent as any).config.maxLoops).toBe(5);
  });
});

describe('Reviewer Agent', () => {
  it('creates agent in qa mode with injected tools', () => {
    const testTools = [mockToolDef('run_tests') as any];
    const agent = createReviewerAgent({ mode: 'qa', tools: testTools });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('reviewer');
    expect((agent as any).config.exitToolName).toBe('finish_implementation');
    expect((agent as any).config.maxLoops).toBe(10);
  });

  it('creates agent in review mode (default)', () => {
    const agent = createReviewerAgent({ mode: 'review' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('reviewer');
    expect((agent as any).config.exitToolName).toBe('finish_implementation');
  });

  it('creates agent in supervise mode with built-in tools', () => {
    const agent = createReviewerAgent({ mode: 'supervise' });
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('reviewer');
    expect((agent as any).config.maxLoops).toBe(5);
    // Should have validate_output, read_file, list_files
    const toolCount = (agent as any).config.tools?.length ?? 0;
    expect(toolCount).toBe(3);
  });

  it('defaults to review mode when no mode specified', () => {
    const agent = createReviewerAgent();
    expect(agent).toBeDefined();
    expect((agent as any).config.exitToolName).toBe('finish_implementation');
  });

  it('supports initialMessages for resume', () => {
    const messages = [{ role: 'system' as const, content: 'hello' }];
    const agent = createReviewerAgent({ mode: 'qa', initialMessages: messages });
    expect(agent).toBeDefined();
  });
});

describe('Chat Judge Agent', () => {
  it('creates chat-judge agent', () => {
    const agent = createChatJudgeAgent();
    expect(agent).toBeDefined();
    expect((agent as any).config.name).toBe('chat-judge');
    expect((agent as any).config.maxLoops).toBe(1);
    expect((agent as any).config.tools?.length ?? 0).toBe(0);
  });

  it('accepts model override', () => {
    const agent = createChatJudgeAgent({ model: 'gpt-4o-mini' });
    expect(agent).toBeDefined();
  });
});

describe('AGENT_ALIASES backward compatibility', () => {
  const expectedAliases: Record<string, string> = {
    // Planner
    pm: 'planner',
    product_manager: 'planner',
    tech_lead: 'planner',
    'tech-lead': 'planner',
    orchestrator: 'planner',
    // Analyst
    researcher: 'analyst',
    blue_team: 'analyst',
    'blue-team': 'analyst',
    critic: 'analyst',
    arbitrator: 'analyst',
    knowledge_curator: 'analyst',
    'knowledge-curator': 'analyst',
    // Reviewer
    qa_engineer: 'reviewer',
    'qa-engineer': 'reviewer',
    code_reviewer: 'reviewer',
    'code-reviewer': 'reviewer',
    supervisor: 'reviewer',
    // Chat Judge
    complexity_assessor: 'chat-judge',
    'complexity-assessor': 'chat-judge',
  };

  for (const [alias, canonical] of Object.entries(expectedAliases)) {
    it(`maps "${alias}" to "${canonical}"`, () => {
      expect(AGENT_ALIASES[alias]).toBe(canonical);
    });
  }
});

describe('Agent UI Meta', () => {
  const coreAgents = [
    'decision-maker',
    'architect',
    'chat-judge',
    'analyst',
    'planner',
    'developer',
    'reviewer',
    'deployer',
  ];

  it('has UI meta for all 8 core agents', () => {
    for (const agentId of coreAgents) {
      expect(BUILTIN_AGENT_UI[agentId]).toBeDefined();
      expect(BUILTIN_AGENT_UI[agentId].label).toBeTruthy();
      expect(BUILTIN_AGENT_UI[agentId].emoji).toBeTruthy();
      expect(BUILTIN_AGENT_UI[agentId].stage).toBeTruthy();
    }
  });

  it('has exactly 8 builtin agents', () => {
    expect(Object.keys(BUILTIN_AGENT_UI).length).toBe(8);
  });

  it('getAgentUI resolves aliases to canonical UI', () => {
    expect(getAgentUI('pm')).toBe(BUILTIN_AGENT_UI['planner']);
    expect(getAgentUI('researcher')).toBe(BUILTIN_AGENT_UI['analyst']);
    expect(getAgentUI('qa-engineer')).toBe(BUILTIN_AGENT_UI['reviewer']);
    expect(getAgentUI('complexity-assessor')).toBe(BUILTIN_AGENT_UI['chat-judge']);
  });

  it('getAgentUI returns AI_GENERATED style for dynamic agents', () => {
    const ui = getAgentUI('dynamic-my-agent-abc123');
    expect(ui).toBeDefined();
    expect(ui!.label).toBe('AI');
  });

  it('getAgentUI returns undefined for unknown agents', () => {
    expect(getAgentUI('nonexistent-agent')).toBeUndefined();
  });
});
