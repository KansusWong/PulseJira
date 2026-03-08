/**
 * Unit tests for TeamCoordinator.
 *
 * Mocks: @/lib/db/client (supabase), @/connectors/bus/message-bus.
 */

// ---------------------------------------------------------------------------
// Mock helpers — chainable Supabase query builder
// ---------------------------------------------------------------------------

/** Creates a chainable mock that resolves with the given result at terminal position. */
function mockChain(terminalResult: { data: any; error: any }) {
  const chain: any = {};
  const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'lt', 'order', 'single', 'upsert'];
  for (const m of methods) {
    chain[m] = jest.fn(() => chain);
  }
  // Terminal methods return the result
  chain.single = jest.fn(() => terminalResult);
  chain.select = jest.fn(() => {
    // When select is chained further, return the chain; at terminal return result
    const innerChain: any = { ...chain };
    innerChain.single = jest.fn(() => terminalResult);
    innerChain.eq = jest.fn(() => innerChain);
    innerChain.in = jest.fn(() => innerChain);
    innerChain.lt = jest.fn(() => innerChain);
    innerChain.order = jest.fn(() => terminalResult);
    return innerChain;
  });
  return chain;
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

let mockFromBehavior: (table: string) => any;

jest.mock('@/lib/db/client', () => ({
  supabase: {
    from: jest.fn((...args: any[]) => mockFromBehavior(args[0])),
  },
  supabaseConfigured: true,
  assertSupabase: jest.fn(),
  reinitializeSupabase: jest.fn(),
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

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { TeamCoordinator } from '@/lib/services/team-coordinator';
import { messageBus } from '@/connectors/bus/message-bus';

const TEAM_ID = 'team-001';
const TASK_A = 'task-a';
const TASK_B = 'task-b';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTeamRow(overrides: Record<string, any> = {}) {
  return {
    id: TEAM_ID,
    conversation_id: 'conv-1',
    project_id: null,
    team_name: 'test-team',
    lead_agent: 'architect',
    status: 'active',
    config: {
      members: ['architect', 'developer'],
      execution_mode: 'agent_team',
      agent_statuses: {},
    },
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTaskRow(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    team_id: TEAM_ID,
    subject: `Task ${id}`,
    description: null,
    owner: null,
    status: 'pending',
    blocks: [],
    blocked_by: [],
    result: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamCoordinator', () => {
  let coordinator: TeamCoordinator;

  beforeEach(() => {
    coordinator = new TeamCoordinator();
    jest.clearAllMocks();
    // Default: no-op from behavior
    mockFromBehavior = () => mockChain({ data: null, error: null });
  });

  // 1. updateAgentStatus — updates status and getTeamStatus returns it
  describe('updateAgentStatus', () => {
    it('updates agent status in config and publishes event', async () => {
      const teamRow = makeTeamRow();
      let savedConfig: any = null;

      mockFromBehavior = (table: string) => {
        if (table === 'agent_teams') {
          const chain: any = {};
          chain.select = jest.fn(() => {
            const inner: any = {};
            inner.eq = jest.fn(() => inner);
            inner.single = jest.fn(() => ({ data: teamRow, error: null }));
            return inner;
          });
          chain.update = jest.fn((payload: any) => {
            savedConfig = payload.config;
            const inner: any = {};
            inner.eq = jest.fn(() => ({ data: null, error: null }));
            return inner;
          });
          chain.eq = jest.fn(() => chain);
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      await coordinator.updateAgentStatus(TEAM_ID, 'architect', 'working', 'designing');

      expect(savedConfig).toBeDefined();
      expect(savedConfig.agent_statuses.architect).toEqual({
        status: 'working',
        current_task: 'designing',
      });
      expect(messageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'team-comms',
          payload: expect.objectContaining({
            agent_name: 'architect',
            status: 'working',
          }),
        }),
      );
    });
  });

  // 2. updateTaskStatus — pending → in_progress without dependencies succeeds
  describe('updateTaskStatus (no deps)', () => {
    it('transitions pending → in_progress when no blocked_by', async () => {
      const taskRow = makeTaskRow(TASK_A);
      const updatedRow = { ...taskRow, status: 'in_progress' };

      mockFromBehavior = (table: string) => {
        if (table === 'team_tasks') {
          const chain: any = {};
          chain.select = jest.fn(() => {
            const inner: any = {};
            inner.eq = jest.fn(() => inner);
            inner.single = jest.fn(() => ({ data: taskRow, error: null }));
            return inner;
          });
          chain.update = jest.fn(() => {
            const inner: any = {};
            inner.eq = jest.fn(() => inner);
            inner.select = jest.fn(() => {
              const s: any = {};
              s.single = jest.fn(() => ({ data: updatedRow, error: null }));
              return s;
            });
            return inner;
          });
          chain.eq = jest.fn(() => chain);
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      const result = await coordinator.updateTaskStatus(TEAM_ID, TASK_A, 'in_progress');
      expect(result.status).toBe('in_progress');
      expect(messageBus.publish).toHaveBeenCalled();
    });
  });

  // 3. updateTaskStatus — pending → in_progress with incomplete deps throws
  describe('updateTaskStatus (blocked)', () => {
    it('throws when blocked_by tasks are not completed', async () => {
      const taskRow = makeTaskRow(TASK_B, { blocked_by: [TASK_A] });
      const blockerRow = makeTaskRow(TASK_A, { status: 'pending' });

      mockFromBehavior = (table: string) => {
        if (table === 'team_tasks') {
          const chain: any = {};
          chain.select = jest.fn(() => {
            const inner: any = {};
            inner.eq = jest.fn(() => inner);
            inner.in = jest.fn(() => ({ data: [blockerRow], error: null }));
            inner.single = jest.fn(() => ({ data: taskRow, error: null }));
            return inner;
          });
          chain.eq = jest.fn(() => chain);
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      await expect(
        coordinator.updateTaskStatus(TEAM_ID, TASK_B, 'in_progress'),
      ).rejects.toThrow(/blocked by incomplete tasks/);
    });
  });

  // 4. updateTaskStatus — in_progress → completed with result
  describe('updateTaskStatus (complete)', () => {
    it('stores result on completion', async () => {
      const taskRow = makeTaskRow(TASK_A, { status: 'in_progress' });
      const resultData = { output: 'done' };
      const updatedRow = { ...taskRow, status: 'completed', result: resultData };

      mockFromBehavior = (table: string) => {
        if (table === 'team_tasks') {
          const chain: any = {};
          chain.select = jest.fn(() => {
            const inner: any = {};
            inner.eq = jest.fn(() => inner);
            inner.single = jest.fn(() => ({ data: taskRow, error: null }));
            return inner;
          });
          chain.update = jest.fn(() => {
            const inner: any = {};
            inner.eq = jest.fn(() => inner);
            inner.select = jest.fn(() => {
              const s: any = {};
              s.single = jest.fn(() => ({ data: updatedRow, error: null }));
              return s;
            });
            return inner;
          });
          chain.eq = jest.fn(() => chain);
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      const result = await coordinator.updateTaskStatus(TEAM_ID, TASK_A, 'completed', resultData);
      expect(result.status).toBe('completed');
      expect(result.result).toEqual(resultData);
    });
  });

  // 5. setTaskDependencies — bidirectional maintenance
  describe('setTaskDependencies', () => {
    it('sets blocked_by on target and blocks on blocker', async () => {
      const targetTask = makeTaskRow(TASK_B, { blocked_by: [] });
      const blockerTask = makeTaskRow(TASK_A, { blocks: [] });

      let targetBlockedBy: string[] | null = null;
      let blockerBlocks: string[] | null = null;

      mockFromBehavior = (table: string) => {
        if (table === 'team_tasks') {
          const chain: any = {};
          chain.select = jest.fn(() => {
            const inner: any = {};
            inner.eq = jest.fn((_col: string, val: string) => {
              // Return different tasks based on the id equality
              inner._lastEqVal = val;
              return inner;
            });
            inner.single = jest.fn(() => {
              // Determine which task to return based on last eq value
              if (inner._lastEqVal === TASK_B) {
                return { data: targetTask, error: null };
              }
              return { data: blockerTask, error: null };
            });
            return inner;
          });
          chain.update = jest.fn((payload: any) => {
            if (payload.blocked_by) targetBlockedBy = payload.blocked_by;
            if (payload.blocks) blockerBlocks = payload.blocks;
            const inner: any = {};
            inner.eq = jest.fn(() => ({ data: null, error: null }));
            return inner;
          });
          chain.eq = jest.fn(() => chain);
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      await coordinator.setTaskDependencies(TEAM_ID, TASK_B, [TASK_A]);

      expect(targetBlockedBy).toEqual([TASK_A]);
      expect(blockerBlocks).toEqual([TASK_B]);
    });
  });

  // 6. markAsRead — updates read=true
  describe('markAsRead', () => {
    it('returns count of messages marked as read', async () => {
      mockFromBehavior = (table: string) => {
        if (table === 'agent_mailbox') {
          const chain: any = {};
          chain.update = jest.fn(() => chain);
          chain.eq = jest.fn(() => chain);
          chain.select = jest.fn(() => ({
            data: [{ id: 'msg-1' }, { id: 'msg-2' }],
            error: null,
          }));
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      const count = await coordinator.markAsRead(TEAM_ID, 'developer');
      expect(count).toBe(2);
    });
  });

  // 7. cleanupMailbox — deletes old messages
  describe('cleanupMailbox', () => {
    it('deletes messages older than retention period', async () => {
      mockFromBehavior = (table: string) => {
        if (table === 'agent_mailbox') {
          const chain: any = {};
          chain.delete = jest.fn(() => chain);
          chain.eq = jest.fn(() => chain);
          chain.lt = jest.fn(() => chain);
          chain.select = jest.fn(() => ({
            data: [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }],
            error: null,
          }));
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      const count = await coordinator.cleanupMailbox(TEAM_ID, 1000); // 1s retention
      expect(count).toBe(3);
    });
  });

  // 8. clearMailbox — clears all messages for a team
  describe('clearMailbox', () => {
    it('deletes all messages for the team', async () => {
      let deletedTeamId: string | null = null;

      mockFromBehavior = (table: string) => {
        if (table === 'agent_mailbox') {
          const chain: any = {};
          chain.delete = jest.fn(() => chain);
          chain.eq = jest.fn((_col: string, val: string) => {
            deletedTeamId = val;
            return { data: null, error: null };
          });
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      await coordinator.clearMailbox(TEAM_ID);
      expect(deletedTeamId).toBe(TEAM_ID);
    });
  });

  // 9. disbandTeam — updates status + clears mailbox
  describe('disbandTeam', () => {
    it('sets status to disbanded and clears mailbox', async () => {
      let teamStatusUpdate: string | null = null;
      let mailboxCleared = false;

      mockFromBehavior = (table: string) => {
        if (table === 'agent_teams') {
          const chain: any = {};
          chain.update = jest.fn((payload: any) => {
            teamStatusUpdate = payload.status;
            const inner: any = {};
            inner.eq = jest.fn(() => ({ data: null, error: null }));
            return inner;
          });
          chain.eq = jest.fn(() => chain);
          return chain;
        }
        if (table === 'agent_mailbox') {
          const chain: any = {};
          chain.delete = jest.fn(() => chain);
          chain.eq = jest.fn(() => {
            mailboxCleared = true;
            return { data: null, error: null };
          });
          return chain;
        }
        return mockChain({ data: null, error: null });
      };

      await coordinator.disbandTeam(TEAM_ID);

      expect(teamStatusUpdate).toBe('disbanded');
      expect(mailboxCleared).toBe(true);
      expect(messageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'team-comms',
          type: 'agent_complete',
          payload: expect.objectContaining({ team_id: TEAM_ID, status: 'disbanded' }),
        }),
      );
    });
  });
});
