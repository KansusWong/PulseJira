/**
 * Provider-specific balance/quota checking.
 *
 * Supported:
 *   - DeepSeek: Official GET /user/balance endpoint
 *   - OpenAI:   Undocumented /v1/dashboard/billing/credit_grants (best-effort)
 *   - GLM:      BigModel finance endpoint (best-effort, requires auth token/cookie)
 *
 * Unsupported providers return local usage stats from llm_usage table.
 */

import { supabase } from '@/lib/db/client';

export interface BalanceInfo {
  accountId: string;
  /** Whether the provider supports remote balance queries. */
  supported: boolean;
  /** Human-readable balance string, e.g. "¥108.50" or "N/A". */
  balance: string | null;
  /** Currency code, e.g. "CNY", "USD". */
  currency: string | null;
  /** Token balance (when provider exposes token and cash separately). */
  tokenBalance: string | null;
  /** Token unit, usually "TOKENS". */
  tokenCurrency: string | null;
  /** Monetary balance (when provider exposes cash and token separately). */
  cashBalance: string | null;
  /** Monetary currency code, e.g. "CNY". */
  cashCurrency: string | null;
  /** Whether the account is currently usable (has remaining balance). */
  isAvailable: boolean | null;
  /** Granted (promotional) balance, if applicable. */
  grantedBalance: string | null;
  /** Topped-up (purchased) balance, if applicable. */
  toppedUpBalance: string | null;
  /** Local usage from llm_usage table (last 30 days). */
  localUsage: { totalTokens: number; totalCalls: number } | null;
  /** Error message if remote query failed. */
  error: string | null;
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,\s]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatTokenAmount(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatMoneyAmount(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeCurrencyCode(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const t = raw.toLowerCase();

  if (t.includes('token')) return 'TOKENS';
  if (t === '¥' || t.includes('cny') || t.includes('rmb') || t.includes('人民币') || t.includes('yuan')) return 'CNY';
  if (t === '$' || t.includes('usd') || t.includes('dollar')) return 'USD';
  if (t === '€' || t.includes('eur')) return 'EUR';

  const up = raw.toUpperCase();
  return /^[A-Z]{3,8}$/.test(up) ? up : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function pickRowCurrency(row: Record<string, unknown>): string | null {
  const candidates = [
    row.consumeType,
    row.currency,
    row.currencyCode,
    row.balanceCurrency,
    row.currencyType,
    row.moneyCurrency,
    row.unit,
    row.balanceUnit,
  ];

  for (const c of candidates) {
    const code = normalizeCurrencyCode(c);
    if (code) return code;
  }
  return null;
}

function containsText(haystack: unknown, needle: string): boolean {
  if (!needle) return false;
  return normalizeText(haystack).includes(needle);
}

function normalizeConsumeType(row: Record<string, unknown>): 'TOKENS' | 'TIMES' | null {
  const raw = normalizeText(row.consumeType ?? row.consumeUnit ?? row.unit ?? row.balanceUnit);
  if (!raw) return null;
  if (raw.includes('token')) return 'TOKENS';
  if (raw.includes('time') || raw.includes('times') || raw.includes('次')) return 'TIMES';
  return null;
}

function hasTokenPackageMarkers(row: Record<string, unknown>): boolean {
  return (
    row.tokenNo !== undefined ||
    row.tokensMagnitude !== undefined ||
    row.tokenPurpose !== undefined ||
    row.resourcePackageName !== undefined ||
    row.suitableModel !== undefined ||
    row.packageExpirationTime !== undefined ||
    row.purchaseOrderNo !== undefined ||
    normalizeConsumeType(row) !== null
  );
}

function rowMatchesModel(row: Record<string, unknown>, modelNeedle: string): boolean {
  if (!modelNeedle) return false;
  return (
    containsText(row.suitableModel, modelNeedle) ||
    containsText(row.modelName, modelNeedle) ||
    containsText(row.model, modelNeedle) ||
    containsText(row.packageName, modelNeedle) ||
    containsText(row.resourcePackageName, modelNeedle) ||
    containsText(row.suitableScene, modelNeedle) ||
    containsText(row.accountName, modelNeedle)
  );
}

function hasAnyNumeric(row: Record<string, unknown>, fields: string[]): boolean {
  for (const key of fields) {
    if (parseNumeric(row[key]) !== null) return true;
  }
  return false;
}

function isLikelyTokenRow(row: Record<string, unknown>): boolean {
  const consumeType = normalizeConsumeType(row);
  if (consumeType === 'TOKENS' || consumeType === 'TIMES') return true;

  const currencyCode = pickRowCurrency(row);
  if (currencyCode === 'TOKENS') return true;
  if (currencyCode && currencyCode !== 'TOKENS') return false;

  return (
    hasAnyNumeric(row, [
      'tokenBalance',
      'remainingTokens',
      'availableTokens',
      'remainToken',
      'tokenRemain',
      'availableToken',
      'tokenAvailable',
      'tokensMagnitude',
      'totalTokens',
      'usedTokens',
      'consumedTokens',
    ]) ||
    containsText(row.accountName, 'token') ||
    containsText(row.packageName, 'token') ||
    containsText(row.resourcePackageName, 'token') ||
    containsText(row.suitableModel, 'glm') ||
    containsText(row.unit, 'token') ||
    containsText(row.consumeType, 'token')
  );
}

function isLikelyCashRow(row: Record<string, unknown>): boolean {
  const currencyCode = pickRowCurrency(row);
  if (currencyCode && currencyCode !== 'TOKENS') return true;
  if (currencyCode === 'TOKENS') return false;
  if (hasTokenPackageMarkers(row)) return false;

  return hasAnyNumeric(row, [
    'cashBalance',
    'availableBalance',
    'remainBalance',
    'remainingBalance',
    'accountBalance',
    'moneyBalance',
    'cnyBalance',
    'balanceCny',
    'cashAmount',
    'remainingCash',
    'availableCash',
    'totalBalance',
    'totalMoney',
    'usedBalance',
    'usedMoney',
  ]);
}

function pickRemainingTokens(row: Record<string, unknown>): number | null {
  if (!isLikelyTokenRow(row)) return null;
  if (normalizeConsumeType(row) === 'TIMES') return null;

  const directFields = [
    'tokenBalance',
    'remainingTokens',
    'availableTokens',
    'remainToken',
    'tokenRemain',
    'availableToken',
    'tokenAvailable',
    'tokensMagnitude',
    'availableBalance',
  ];
  for (const key of directFields) {
    const n = parseNumeric(row[key]);
    if (n !== null) return n;
  }

  const currencyCode = pickRowCurrency(row);
  if (currencyCode === 'TOKENS') {
    const genericFields = [
      'balance',
      'availableAmount',
      'remainAmount',
      'remainingAmount',
      'surplusAmount',
      'leftAmount',
      'restAmount',
    ];
    for (const key of genericFields) {
      const n = parseNumeric(row[key]);
      if (n !== null) return n;
    }
  }

  // Fallback: derive remaining from total - used when direct balance is absent.
  const total = parseNumeric(row.totalTokens);
  const used =
    parseNumeric(row.usedTokens) ??
    parseNumeric(row.consumedTokens);
  if (total !== null && used !== null) return Math.max(0, total - used);

  return null;
}

function pickRemainingCash(row: Record<string, unknown>): number | null {
  if (!isLikelyCashRow(row)) return null;

  const directFields = [
    'cashBalance',
    'availableBalance',
    'remainBalance',
    'remainingBalance',
    'accountBalance',
    'moneyBalance',
    'cnyBalance',
    'balanceCny',
    'cashAmount',
    'remainingCash',
    'availableCash',
  ];
  for (const key of directFields) {
    const n = parseNumeric(row[key]);
    if (n !== null) return n;
  }

  const currencyCode = pickRowCurrency(row);
  if (currencyCode && currencyCode !== 'TOKENS') {
    const genericFields = [
      'balance',
      'availableAmount',
      'remainAmount',
      'remainingAmount',
      'surplusAmount',
      'leftAmount',
      'restAmount',
    ];
    for (const key of genericFields) {
      const n = parseNumeric(row[key]);
      if (n !== null) return n;
    }
  }

  const total = parseNumeric(row.totalBalance) ?? parseNumeric(row.totalMoney);
  const used =
    parseNumeric(row.usedBalance) ??
    parseNumeric(row.consumedBalance) ??
    parseNumeric(row.usedMoney);
  if (total !== null && used !== null) return Math.max(0, total - used);

  return null;
}

function pickPreferredGlmRow(
  rows: Record<string, unknown>[],
  accountName?: string,
  defaultModel?: string,
): Record<string, unknown> | null {
  const modelNeedle = normalizeText(defaultModel);
  if (modelNeedle) {
    const byModel = rows.find((r) =>
      rowMatchesModel(r, modelNeedle),
    );
    if (byModel) return byModel;
  }

  const nameNeedle = normalizeText(accountName);
  if (nameNeedle) {
    const byName = rows.find((r) => containsText(r.accountName, nameNeedle));
    if (byName) return byName;
  }

  return rows[0] || null;
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw || '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function pickCashFromPayloadSummary(payload: any): { amount: number; currency: string } | null {
  const rawCurrency =
    payload?.data?.currency ||
    payload?.data?.currencyCode ||
    payload?.currency ||
    payload?.currencyCode;
  const currencyCode = normalizeCurrencyCode(rawCurrency);
  const summaryCurrency = currencyCode && currencyCode !== 'TOKENS' ? currencyCode : null;

  const candidates: Array<{ value: unknown; allowWithoutCurrency: boolean }> = [
    // Explicit cash-like fields are safe even when summary currency is missing.
    { value: payload?.data?.availableBalance, allowWithoutCurrency: true },
    { value: payload?.data?.cashBalance, allowWithoutCurrency: true },
    { value: payload?.data?.accountBalance, allowWithoutCurrency: true },
    { value: payload?.data?.totalBalance, allowWithoutCurrency: true },
    { value: payload?.availableBalance, allowWithoutCurrency: true },
    { value: payload?.cashBalance, allowWithoutCurrency: true },
    { value: payload?.accountBalance, allowWithoutCurrency: true },
    { value: payload?.totalBalance, allowWithoutCurrency: true },

    // Generic "balance" can be token quota on BigModel; only trust it if a
    // non-token currency is explicitly provided in summary metadata.
    { value: payload?.data?.balance, allowWithoutCurrency: false },
    { value: payload?.balance, allowWithoutCurrency: false },
  ];

  for (const candidate of candidates) {
    const amount = parseNumeric(candidate.value);
    if (amount === null) continue;
    if (summaryCurrency) return { amount, currency: summaryCurrency };
    if (candidate.allowWithoutCurrency) return { amount, currency: 'CNY' };
  }

  return null;
}

async function fetchGLMCashSummary(input: {
  authorization: string;
  cookie?: string;
}): Promise<{ cash: { amount: number; currency: string } | null; granted: string | null; toppedUp: string | null }> {
  const candidates = [
    'https://www.bigmodel.cn/api/biz/account/query-customer-account-report',
    'https://bigmodel.cn/api/biz/account/query-customer-account-report',
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          ...(input.authorization ? { Authorization: input.authorization } : {}),
          ...(input.cookie ? { Cookie: input.cookie } : {}),
          Referer: 'https://www.bigmodel.cn/finance-center/finance/overview',
          Origin: 'https://www.bigmodel.cn',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;
      const rawText = await res.text();
      let payload: any = null;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        continue;
      }

      const cash = pickCashFromPayloadSummary(payload);
      const granted = parseNumeric(payload?.data?.giveAmount ?? payload?.data?.grantedBalance);
      const toppedUp = parseNumeric(payload?.data?.rechargeAmount ?? payload?.data?.toppedUpBalance);
      if (cash || granted !== null || toppedUp !== null) {
        return {
          cash,
          granted: granted !== null ? formatMoneyAmount(granted) : null,
          toppedUp: toppedUp !== null ? formatMoneyAmount(toppedUp) : null,
        };
      }
    } catch {
      // Try next candidate URL.
    }
  }

  return { cash: null, granted: null, toppedUp: null };
}

// ---------------------------------------------------------------------------
// GLM / BigModel — finance-center endpoint (best-effort)
// ---------------------------------------------------------------------------

async function checkGLMBalance(input: {
  apiKey: string;
  accountName?: string;
  defaultModel?: string;
}): Promise<Partial<BalanceInfo>> {
  const configuredUrl = process.env.GLM_FINANCE_API_URL?.trim();
  const urlCandidates = uniqueNonEmpty([
    configuredUrl,
    'https://www.bigmodel.cn/api/biz/tokenAccounts/list?filterEnabled=true',
    'https://bigmodel.cn/api/biz/tokenAccounts/list?filterEnabled=true',
    'https://www.bigmodel.cn/api/biz/tokenAccounts/list/my?filterEnabled=true',
    'https://bigmodel.cn/api/biz/tokenAccounts/list/my?filterEnabled=true',
  ]);
  const cookie = process.env.GLM_FINANCE_COOKIE?.trim();
  const configuredAuth = process.env.GLM_FINANCE_AUTHORIZATION?.trim();
  const token = process.env.GLM_FINANCE_TOKEN?.trim();
  const apiKey = input.apiKey?.trim();

  const authCandidates = uniqueNonEmpty([
    configuredAuth,
    token ? `Bearer ${token}` : '',
    apiKey?.startsWith('Bearer ') ? apiKey : '',
    apiKey ? `Bearer ${apiKey}` : '',
    apiKey,
  ]);

  const requestAuthCandidates = [
    ...(cookie ? [''] : []),
    ...authCandidates,
  ];

  if (requestAuthCandidates.length === 0) {
    return {
      supported: true,
      error: '未配置 GLM Finance 鉴权。请设置 GLM_FINANCE_AUTHORIZATION、GLM_FINANCE_TOKEN 或 GLM_FINANCE_COOKIE',
    };
  }

  let lastError = '';
  for (const urlCandidate of urlCandidates) {
    for (const authorization of requestAuthCandidates) {
      try {
        const res = await fetch(urlCandidate, {
          method: 'GET',
          headers: {
            Accept: 'application/json, text/plain, */*',
            ...(authorization ? { Authorization: authorization } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            Referer: 'https://www.bigmodel.cn/finance-center/finance/overview',
            Origin: 'https://www.bigmodel.cn',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const text = await res.text();
          lastError = `GLM finance(${urlCandidate}) HTTP ${res.status}: ${text.slice(0, 120)}`;
          continue;
        }

        const rawText = await res.text();
        let payload: any = null;
        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch {
          lastError = `GLM finance(${urlCandidate}) 返回非 JSON: ${rawText.slice(0, 120)}`;
          continue;
        }

        const payloadCash = pickCashFromPayloadSummary(payload);
        const rowsRaw =
          payload?.data?.rows ||
          payload?.data?.list ||
          payload?.data?.data?.rows ||
          payload?.data?.data?.list ||
          (Array.isArray(payload?.data) ? payload.data : null) ||
          payload?.rows ||
          payload?.list;

        if (!Array.isArray(rowsRaw)) {
          if (payloadCash) {
            return {
              supported: true,
              balance: formatMoneyAmount(payloadCash.amount),
              currency: payloadCash.currency,
              tokenBalance: null,
              tokenCurrency: null,
              cashBalance: formatMoneyAmount(payloadCash.amount),
              cashCurrency: payloadCash.currency,
              isAvailable: payloadCash.amount > 0,
            };
          }
          lastError = `GLM finance(${urlCandidate}) 返回结构异常（缺少 rows/list）`;
          continue;
        }

        const rows = rowsRaw.filter((r) => !!r && typeof r === 'object') as Record<string, unknown>[];
        if (rows.length === 0) {
          return {
            supported: true,
            balance: '0',
            currency: 'TOKENS',
            tokenBalance: '0',
            tokenCurrency: 'TOKENS',
            isAvailable: false,
          };
        }

        const preferred = pickPreferredGlmRow(rows, input.accountName, input.defaultModel);

        const tokenRows = rows
          .map((row) => ({ row, amount: pickRemainingTokens(row) }))
          .filter((item): item is { row: Record<string, unknown>; amount: number } => item.amount !== null);

        const modelNeedle = normalizeText(input.defaultModel);
        let tokenRemaining: number | null = null;
        if (tokenRows.length > 0) {
          if (modelNeedle) {
            const modelRows = tokenRows.filter(({ row }) => rowMatchesModel(row, modelNeedle));
            if (modelRows.length > 0) {
              tokenRemaining = modelRows.reduce((sum, item) => sum + item.amount, 0);
            } else {
              const genericRows = tokenRows.filter(
                ({ row }) =>
                  !normalizeText(row.suitableModel) &&
                  !normalizeText(row.modelName) &&
                  !normalizeText(row.model),
              );
              tokenRemaining =
                genericRows.length > 0
                  ? genericRows.reduce((sum, item) => sum + item.amount, 0)
                  : 0;
            }
          } else {
            tokenRemaining = tokenRows.reduce((sum, item) => sum + item.amount, 0);
          }
        }

        const preferredCash = preferred ? pickRemainingCash(preferred) : null;
        const cashSummary = await fetchGLMCashSummary({
          authorization,
          cookie: cookie || undefined,
        });

        let cashRemaining = cashSummary.cash?.amount ?? payloadCash?.amount ?? preferredCash;
        let rowCashCurrency: string | null = null;
        if (cashRemaining === null) {
          const cashCandidates = rows
            .map((row) => ({
              amount: pickRemainingCash(row),
              currency: pickRowCurrency(row),
            }))
            .filter((item): item is { amount: number; currency: string | null } => item.amount !== null);

          const picked =
            cashCandidates.find((item) => item.currency && item.currency !== 'TOKENS') ||
            cashCandidates[0];

          if (picked) {
            cashRemaining = picked.amount;
            rowCashCurrency = picked.currency && picked.currency !== 'TOKENS' ? picked.currency : null;
          }
        }

        if (tokenRemaining === null && cashRemaining === null) {
          lastError = `GLM finance(${urlCandidate}) 响应中未找到可识别的余额字段`;
          continue;
        }

        const cashCurrency =
          cashRemaining !== null
            ? (() => {
                if (cashSummary.cash?.currency) return cashSummary.cash.currency;
                if (payloadCash?.currency) return payloadCash.currency;

                const preferredCode = preferred ? pickRowCurrency(preferred) : null;
                if (preferredCode && preferredCode !== 'TOKENS') return preferredCode;
                if (rowCashCurrency) return rowCashCurrency;
                for (const row of rows) {
                  const code = pickRowCurrency(row);
                  if (code && code !== 'TOKENS') return code;
                }
                return 'CNY';
              })()
            : null;

        const tokenBalance = tokenRemaining !== null ? formatTokenAmount(tokenRemaining) : null;
        const cashBalance = cashRemaining !== null ? formatMoneyAmount(cashRemaining) : null;

        return {
          supported: true,
          balance: tokenBalance ?? cashBalance,
          currency: tokenBalance ? 'TOKENS' : cashCurrency,
          tokenBalance,
          tokenCurrency: tokenBalance ? 'TOKENS' : null,
          cashBalance,
          cashCurrency,
          isAvailable: (tokenRemaining ?? 0) > 0 || (cashRemaining ?? 0) > 0,
          grantedBalance: cashSummary.granted,
          toppedUpBalance: cashSummary.toppedUp,
        };
      } catch (e: any) {
        lastError = `GLM finance(${urlCandidate}) ${e?.message || '请求失败'}`;
      }
    }
  }

  return {
    supported: true,
    error: lastError || 'GLM finance 查询失败',
  };
}
// ---------------------------------------------------------------------------
// DeepSeek — Official API
// ---------------------------------------------------------------------------

async function checkDeepSeekBalance(apiKey: string, baseURL?: string): Promise<Partial<BalanceInfo>> {
  const url = (baseURL || 'https://api.deepseek.com').replace(/\/+$/, '') + '/user/balance';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { supported: true, error: `HTTP ${res.status}: ${text.slice(0, 100)}` };
    }
    const data = await res.json();
    const info = data.balance_infos?.[0];
    return {
      supported: true,
      isAvailable: data.is_available ?? null,
      balance: info?.total_balance ?? null,
      currency: info?.currency ?? null,
      cashBalance: info?.total_balance ?? null,
      cashCurrency: info?.currency ?? null,
      grantedBalance: info?.granted_balance ?? null,
      toppedUpBalance: info?.topped_up_balance ?? null,
    };
  } catch (e: any) {
    return { supported: true, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// OpenAI — Undocumented billing endpoint (best-effort)
// ---------------------------------------------------------------------------

async function checkOpenAIBalance(apiKey: string, baseURL?: string): Promise<Partial<BalanceInfo>> {
  // Only try for official OpenAI endpoints
  const base = (baseURL || 'https://api.openai.com').replace(/\/+$/, '');
  if (!base.includes('openai.com')) {
    return { supported: false };
  }

  const url = base.replace(/\/v1\/?$/, '') + '/v1/dashboard/billing/credit_grants';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { supported: false, error: `Billing API unavailable (${res.status})` };
    }
    const data = await res.json();
    const totalGranted = data.total_granted ?? 0;
    const totalUsed = data.total_used ?? 0;
    const remaining = (totalGranted - totalUsed).toFixed(2);
    return {
      supported: true,
      balance: remaining,
      currency: 'USD',
      cashBalance: remaining,
      cashCurrency: 'USD',
      isAvailable: parseFloat(remaining) > 0,
      grantedBalance: String(totalGranted),
    };
  } catch {
    return { supported: false };
  }
}

// ---------------------------------------------------------------------------
// Local usage stats from llm_usage table
// ---------------------------------------------------------------------------

async function getLocalUsage(accountId: string): Promise<{ totalTokens: number; totalCalls: number }> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('llm_usage')
      .select('total_tokens')
      .eq('account_id', accountId)
      .gte('used_at', thirtyDaysAgo);

    if (error || !data) return { totalTokens: 0, totalCalls: 0 };

    const totalTokens = data.reduce((sum, r) => sum + (r.total_tokens || 0), 0);
    return { totalTokens, totalCalls: data.length };
  } catch {
    return { totalTokens: 0, totalCalls: 0 };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkAccountBalance(account: {
  id: string;
  provider: string;
  apiKey: string;
  name?: string;
  defaultModel?: string;
  baseURL?: string;
}): Promise<BalanceInfo> {
  const base: BalanceInfo = {
    accountId: account.id,
    supported: false,
    balance: null,
    currency: null,
    tokenBalance: null,
    tokenCurrency: null,
    cashBalance: null,
    cashCurrency: null,
    isAvailable: null,
    grantedBalance: null,
    toppedUpBalance: null,
    localUsage: null,
    error: null,
  };

  // Remote balance check (provider-specific)
  let remote: Partial<BalanceInfo> = {};
  switch (account.provider) {
    case 'deepseek':
      remote = await checkDeepSeekBalance(account.apiKey, account.baseURL);
      break;
    case 'openai':
      remote = await checkOpenAIBalance(account.apiKey, account.baseURL);
      break;
    case 'glm':
      remote = await checkGLMBalance({
        apiKey: account.apiKey,
        accountName: account.name,
        defaultModel: account.defaultModel,
      });
      break;
    // custom, etc. — no remote API
  }

  // Local usage stats (always available)
  const localUsage = await getLocalUsage(account.id);

  return {
    ...base,
    ...remote,
    accountId: account.id,
    localUsage,
  };
}

/**
 * Check balance for all accounts in parallel.
 */
export async function checkAllBalances(accounts: {
  id: string;
  provider: string;
  apiKey: string;
  name?: string;
  defaultModel?: string;
  baseURL?: string;
}[]): Promise<BalanceInfo[]> {
  return Promise.all(accounts.map(checkAccountBalance));
}
