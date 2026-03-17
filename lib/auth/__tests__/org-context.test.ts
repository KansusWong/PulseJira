import { resolveOrgContext, type OrgContext } from '../org-context';

jest.mock('@/lib/db/client', () => {
  const mockEq = jest.fn();
  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockSingle = jest.fn();

  mockEq.mockReturnValue({
    eq: jest.fn().mockReturnValue({
      single: mockSingle,
    }),
  });

  mockSelect.mockReturnValue({
    eq: mockEq,
  });

  mockFrom.mockReturnValue({
    select: mockSelect,
  });

  mockSingle.mockResolvedValue({
    data: { role: 'admin' },
    error: null,
  });

  return {
    supabase: {
      from: mockFrom,
    },
    supabaseConfigured: true,
  };
});

describe('resolveOrgContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves org context from userId and orgId', async () => {
    const ctx = await resolveOrgContext('user-1', 'org-1');
    expect(ctx).toEqual({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
  });

  it('returns null when user not in org', async () => {
    const { supabase } = require('@/lib/db/client');
    supabase.from().select().eq().eq().single.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116' },
    });
    const ctx = await resolveOrgContext('user-1', 'org-999');
    expect(ctx).toBeNull();
  });
});
