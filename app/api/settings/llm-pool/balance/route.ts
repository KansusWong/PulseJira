/**
 * GET /api/settings/llm-pool/balance — Check balance/quota for all pool accounts.
 *
 * Returns per-account balance info:
 *   - Remote provider balance (DeepSeek, OpenAI) where supported
 *   - Local usage stats from llm_usage table (30 day window) for all accounts
 */

import { NextResponse } from 'next/server';
import { readPoolConfig } from '@/lib/services/llm-pool/pool-store';
import { checkAllBalances } from '@/lib/services/llm-pool/balance-checker';
import { resolveApiKey } from '@/lib/services/llm-pool/secret-store';

export async function GET() {
  try {
    const config = readPoolConfig();

    if (config.accounts.length === 0) {
      return NextResponse.json({
        success: true,
        data: { balances: [] },
      });
    }

    const balances = await checkAllBalances(
      config.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        provider: a.provider,
        apiKey: resolveApiKey(a.apiKey),
        defaultModel: a.defaultModel,
        baseURL: a.baseURL,
      })),
    );

    return NextResponse.json({
      success: true,
      data: { balances },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}
