import type { ToolExecutionResult, AgentContext } from '../types';

// ---------------------------------------------------------------------------
// ToolExecutionResult — discriminated union correctness
// ---------------------------------------------------------------------------
describe('ToolExecutionResult (type-level)', () => {
  it('success=true branch carries data', () => {
    const result: ToolExecutionResult = { success: true, data: { foo: 'bar' } };
    if (result.success) {
      // TypeScript narrows to { success: true; data: unknown }
      expect(result.data).toEqual({ foo: 'bar' });
    }
  });

  it('success=false branch carries error', () => {
    const result: ToolExecutionResult = { success: false, error: 'boom' };
    if (!result.success) {
      // TypeScript narrows to { success: false; error: string }
      expect(result.error).toBe('boom');
    }
  });

  it('branching on success discriminates correctly', () => {
    const results: ToolExecutionResult[] = [
      { success: true, data: 42 },
      { success: false, error: 'fail' },
    ];

    for (const r of results) {
      if (r.success) {
        expect(r.data).toBeDefined();
      } else {
        expect(r.error).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AgentContext — compile-time check: no arbitrary keys
// ---------------------------------------------------------------------------
describe('AgentContext', () => {
  it('accepts known properties', () => {
    const ctx: AgentContext = {
      signalId: 'sig-1',
      projectId: 'proj-1',
      logger: async (msg: string) => { /* noop */ },
    };
    expect(ctx.signalId).toBe('sig-1');
    expect(ctx.projectId).toBe('proj-1');
  });

  it('accepts empty object', () => {
    const ctx: AgentContext = {};
    expect(ctx).toEqual({});
  });
});
