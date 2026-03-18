const mockRpc = jest.fn();
jest.mock('server-only', () => {});
jest.mock('@/lib/db/client', () => ({
  supabase: { rpc: mockRpc },
  supabaseConfigured: true,
}));

import { checkAndDeductQuota, correctQuota } from '../quota-service';

describe('quota-service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('checkAndDeductQuota', () => {
    it('returns true when RPC succeeds (quota available)', async () => {
      mockRpc.mockResolvedValueOnce({ data: true, error: null });
      const result = await checkAndDeductQuota('org-1', 1000);
      expect(result).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('deduct_quota', { p_org_id: 'org-1', p_tokens: 1000 });
    });

    it('returns false when RPC says quota exceeded', async () => {
      mockRpc.mockResolvedValueOnce({ data: false, error: null });
      const result = await checkAndDeductQuota('org-1', 999999);
      expect(result).toBe(false);
    });

    it('returns true (fail-open) when RPC errors', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
      const result = await checkAndDeductQuota('org-1', 1000);
      expect(result).toBe(true);
    });
  });

  describe('correctQuota', () => {
    it('calls correct_quota RPC with diff', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });
      await correctQuota('org-1', 1000, 800);
      expect(mockRpc).toHaveBeenCalledWith('correct_quota', { p_org_id: 'org-1', p_diff: -200 });
    });

    it('skips RPC when diff is zero', async () => {
      await correctQuota('org-1', 1000, 1000);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });
});
