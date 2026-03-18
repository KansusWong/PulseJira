import 'server-only';
import { supabase } from '@/lib/db/client';

/**
 * Atomically deduct estimated tokens from org quota.
 * Returns true if quota allows, false if exceeded.
 */
export async function checkAndDeductQuota(
  orgId: string,
  estimatedTokens: number,
): Promise<boolean> {
  const { data: result, error: rpcErr } = await supabase.rpc('deduct_quota', {
    p_org_id: orgId,
    p_tokens: estimatedTokens,
  });

  if (rpcErr) {
    // Fail-open: if RPC fails, allow the request (availability > strictness for MVP)
    console.error('Quota deduction failed:', rpcErr.message);
    return true;
  }

  return result === true;
}

/**
 * Correct quota after actual token usage is known.
 */
export async function correctQuota(
  orgId: string,
  estimatedTokens: number,
  actualTokens: number,
): Promise<void> {
  const diff = actualTokens - estimatedTokens;
  if (diff === 0) return;

  const { error } = await supabase.rpc('correct_quota', {
    p_org_id: orgId,
    p_diff: diff,
  });

  if (error) {
    console.error('Quota correction failed:', error.message);
  }
}
