jest.mock('server-only', () => {});
jest.mock('@/lib/services/secret-service', () => ({
  resolveProviderKeys: jest.fn().mockResolvedValue([
    { keyName: 'OPENAI_PRIMARY', apiKey: 'sk-test-123', priority: 0 },
  ]),
}));

jest.mock('../pool-store', () => ({
  readPoolConfig: jest.fn().mockReturnValue({
    accounts: [
      {
        id: 'acct-1',
        name: 'OpenAI Main',
        provider: 'openai',
        apiKey: 'old-key',
        baseURL: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4',
        modelMapping: {},
        enabled: true,
        priority: 0,
        tags: [],
        source: 'env-import',
        createdAt: '2024-01-01',
      },
    ],
    strategy: 'priority',
    runtimeConfig: {},
    dismissedEnvAccounts: [],
  }),
}));

import { OrgPoolResolver } from '../org-pool-resolver';

describe('OrgPoolResolver', () => {
  it('resolves accounts for an org', async () => {
    const resolver = new OrgPoolResolver();
    const accounts = await resolver.resolve('org-123');
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0].apiKey).toBe('sk-test-123');
    expect(accounts[0].source).toBe('env-import');
    expect(accounts[0].createdAt).toBeDefined();
  });

  it('caches results within TTL', async () => {
    const resolver = new OrgPoolResolver();
    const a = await resolver.resolve('org-123');
    const b = await resolver.resolve('org-123');
    // Same reference means cache hit
    expect(a).toBe(b);
  });
});
