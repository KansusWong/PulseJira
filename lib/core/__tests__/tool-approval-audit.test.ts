/**
 * Unit tests for tool-approval-audit service and ToolApprovalService audit integration.
 *
 * Mocks: @/lib/db/client (supabase).
 */

// ---------------------------------------------------------------------------
// Mock helpers — chainable Supabase query builder
// ---------------------------------------------------------------------------

let lastInsertArgs: any = null;
let lastUpdateArgs: any = null;
let lastUpdateFilter: string | null = null;
let listReturnData: any[] = [];

function mockChain(terminalResult: { data: any; error: any }) {
  const chain: any = {};
  const methods = ['from', 'select', 'insert', 'update', 'eq', 'order', 'limit', 'single'];
  for (const m of methods) {
    chain[m] = jest.fn(() => chain);
  }

  chain.insert = jest.fn((args: any) => {
    lastInsertArgs = args;
    return terminalResult;
  });

  chain.update = jest.fn((args: any) => {
    lastUpdateArgs = args;
    // Return chain to allow .eq() chaining
    const eqChain: any = { ...terminalResult };
    eqChain.eq = jest.fn((col: string, val: any) => {
      lastUpdateFilter = val;
      return terminalResult;
    });
    return eqChain;
  });

  chain.select = jest.fn(() => {
    const selectChain: any = {};
    selectChain.eq = jest.fn(() => selectChain);
    selectChain.order = jest.fn(() => selectChain);
    selectChain.limit = jest.fn(() => ({ data: listReturnData, error: null }));
    return selectChain;
  });

  return chain;
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/lib/db/client', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      return mockChain({ data: null, error: null });
    }),
  },
  supabaseConfigured: true,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { recordToolApprovalEvent, listToolApprovalAudits } from '@/lib/services/tool-approval-audit';
import { supabase } from '@/lib/db/client';

beforeEach(() => {
  lastInsertArgs = null;
  lastUpdateArgs = null;
  lastUpdateFilter = null;
  listReturnData = [];
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recordToolApprovalEvent', () => {
  it('inserts a new row when status is "requested"', async () => {
    await recordToolApprovalEvent({
      approvalId: 'appr-001',
      conversationId: 'conv-1',
      agentName: 'architect',
      toolName: 'run-command',
      toolArgs: { cmd: 'npm test' },
      status: 'requested',
    });

    expect(supabase.from).toHaveBeenCalledWith('tool_approval_audits');
    expect(lastInsertArgs).toEqual({
      approval_id: 'appr-001',
      conversation_id: 'conv-1',
      agent_name: 'architect',
      tool_name: 'run-command',
      tool_args: { cmd: 'npm test' },
      status: 'requested',
    });
  });

  it('updates existing row when status is "approved"', async () => {
    await recordToolApprovalEvent({
      approvalId: 'appr-002',
      agentName: 'architect',
      toolName: 'run-command',
      status: 'approved',
      decidedBy: 'user',
    });

    expect(supabase.from).toHaveBeenCalledWith('tool_approval_audits');
    expect(lastUpdateArgs).not.toBeNull();
    expect(lastUpdateArgs.status).toBe('approved');
    expect(lastUpdateArgs.decided_by).toBe('user');
    expect(lastUpdateArgs.decided_at).toBeDefined();
    expect(lastUpdateFilter).toBe('appr-002');
  });

  it('updates with decided_by="timeout" when status is "timed_out"', async () => {
    await recordToolApprovalEvent({
      approvalId: 'appr-003',
      agentName: 'developer',
      toolName: 'deploy',
      status: 'timed_out',
      decidedBy: 'timeout',
    });

    expect(lastUpdateArgs).not.toBeNull();
    expect(lastUpdateArgs.status).toBe('timed_out');
    expect(lastUpdateArgs.decided_by).toBe('timeout');
    expect(lastUpdateFilter).toBe('appr-003');
  });
});

describe('listToolApprovalAudits', () => {
  it('returns mapped and sorted list', async () => {
    listReturnData = [
      {
        id: 'id-1',
        approval_id: 'appr-001',
        conversation_id: 'conv-1',
        agent_name: 'architect',
        tool_name: 'run-command',
        tool_args: null,
        status: 'approved',
        requested_at: '2025-01-01T00:00:00Z',
        decided_at: '2025-01-01T00:01:00Z',
        decided_by: 'user',
        rejection_reason: null,
        created_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'id-2',
        approval_id: 'appr-002',
        conversation_id: 'conv-1',
        agent_name: 'developer',
        tool_name: 'deploy',
        tool_args: { env: 'prod' },
        status: 'rejected',
        requested_at: '2025-01-01T00:02:00Z',
        decided_at: '2025-01-01T00:03:00Z',
        decided_by: 'user',
        rejection_reason: 'Too risky',
        created_at: '2025-01-01T00:02:00Z',
      },
    ];

    const result = await listToolApprovalAudits('conv-1');

    expect(result).toHaveLength(2);
    expect(result[0].approvalId).toBe('appr-001');
    expect(result[0].status).toBe('approved');
    expect(result[1].approvalId).toBe('appr-002');
    expect(result[1].rejectionReason).toBe('Too risky');
    expect(result[1].toolArgs).toEqual({ env: 'prod' });
  });
});

describe('ToolApprovalService timeout audit', () => {
  it('records timed_out audit event on timeout', async () => {
    // We need to re-import with fresh module state to avoid circular mock issues.
    // Instead, test the integration by calling requestApproval with a short timeout.
    jest.useFakeTimers();

    // Reset mocks
    jest.clearAllMocks();

    // Dynamically import to get fresh module with mocked db
    const { toolApprovalService } = await import('@/lib/services/tool-approval');

    // We need to spy on recordToolApprovalEvent
    const auditModule = await import('@/lib/services/tool-approval-audit');
    const recordSpy = jest.spyOn(auditModule, 'recordToolApprovalEvent').mockResolvedValue(undefined);

    const { promise } = toolApprovalService.requestApproval({
      approvalId: 'timeout-test-001',
      toolName: 'dangerous-tool',
      agentName: 'architect',
      conversationId: 'conv-timeout',
    });

    // Fast-forward past the 10-minute timeout
    jest.advanceTimersByTime(10 * 60 * 1000 + 100);

    const result = await promise;
    expect(result).toBe(false);

    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: 'timeout-test-001',
        status: 'timed_out',
        decidedBy: 'timeout',
        agentName: 'architect',
        toolName: 'dangerous-tool',
        conversationId: 'conv-timeout',
      }),
    );

    recordSpy.mockRestore();
    jest.useRealTimers();
  });
});
