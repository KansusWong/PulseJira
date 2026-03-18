import { resolveProviderKeys } from '@/lib/services/secret-service';
import { readPoolConfig } from './pool-store';
import type { LLMAccount } from './types';

// NOTE: LLMAccount.source is typed as 'user' | 'env-import'.
// Platform secrets use 'env-import' since they function identically
// to env-imported accounts (non-user-editable, resolved dynamically).

interface CachedAccounts {
  accounts: LLMAccount[];
  expiresAt: number;
}

export class OrgPoolResolver {
  private cache = new Map<string, CachedAccounts>();
  private TTL = 5 * 60 * 1000; // 5 minutes

  async resolve(orgId: string): Promise<LLMAccount[]> {
    const cached = this.cache.get(orgId);
    if (cached && cached.expiresAt > Date.now()) return cached.accounts;

    const config = readPoolConfig();
    const providers = [...new Set(config.accounts.map((a) => a.provider).filter(Boolean))];

    const accounts: LLMAccount[] = [];
    for (const provider of providers) {
      const keys = await resolveProviderKeys(provider, orgId);
      const templateAccount = config.accounts.find((a) => a.provider === provider);

      for (const key of keys) {
        accounts.push({
          id: `${orgId}-${key.keyName}`,
          name: key.keyName,
          provider: provider,
          apiKey: key.apiKey,
          baseURL: templateAccount?.baseURL || '',
          defaultModel: templateAccount?.defaultModel || '',
          modelMapping: templateAccount?.modelMapping || {},
          enabled: true,
          priority: key.priority,
          tags: templateAccount?.tags || [],
          source: 'env-import',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Fallback: if no secrets found, use config-based accounts (backward compat)
    const result = accounts.length > 0 ? accounts : config.accounts.filter((a) => a.enabled);

    this.cache.set(orgId, { accounts: result, expiresAt: Date.now() + this.TTL });
    return result;
  }

  invalidate(orgId?: string) {
    if (orgId) {
      this.cache.delete(orgId);
    } else {
      this.cache.clear();
    }
  }
}

export const orgPoolResolver = new OrgPoolResolver();
