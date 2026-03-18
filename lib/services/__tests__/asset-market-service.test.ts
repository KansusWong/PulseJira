jest.mock('server-only', () => {});

const mockContains = jest.fn().mockReturnThis();
const mockSingle = jest.fn().mockResolvedValue({ data: { id: 'asset-1', status: 'draft' }, error: null });
const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
const mockEq = jest.fn().mockReturnValue({
  eq: jest.fn().mockReturnValue({
    order: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnThis(),
      contains: mockContains,
      then: jest.fn(),
    }),
    select: mockSelect,
    single: mockSingle,
  }),
  in: jest.fn().mockReturnValue({ select: mockSelect }),
  single: mockSingle,
});

jest.mock('@/lib/db/client', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: mockEq }),
      update: jest.fn().mockReturnValue({ eq: mockEq }),
      eq: mockEq,
    }),
  },
  supabaseConfigured: true,
}));

import { publishAsset, listOrgAssets, deprecateAsset, getAssetDetail } from '../asset-market-service';

describe('asset-market-service', () => {
  it('exports publishAsset and listOrgAssets', () => {
    expect(typeof publishAsset).toBe('function');
    expect(typeof listOrgAssets).toBe('function');
  });

  it('exports deprecateAsset and getAssetDetail', () => {
    expect(typeof deprecateAsset).toBe('function');
    expect(typeof getAssetDetail).toBe('function');
  });
});
