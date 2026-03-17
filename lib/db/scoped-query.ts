import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export function validateOrgId(orgId: string): void {
  if (!orgId) throw new Error('orgId is required for scoped queries');
}

export function scopedSelect(
  supabase: SupabaseClient, table: string, orgId: string, columns = '*',
) {
  validateOrgId(orgId);
  return supabase.from(table).select(columns).eq('org_id', orgId);
}

export function scopedInsert(
  supabase: SupabaseClient, table: string, orgId: string,
  data: Record<string, unknown> | Record<string, unknown>[],
) {
  validateOrgId(orgId);
  const withOrg = Array.isArray(data)
    ? data.map((d) => ({ ...d, org_id: orgId }))
    : { ...data, org_id: orgId };
  return supabase.from(table).insert(withOrg);
}

export function scopedUpdate(
  supabase: SupabaseClient, table: string, orgId: string, data: Record<string, unknown>,
) {
  validateOrgId(orgId);
  return supabase.from(table).update(data).eq('org_id', orgId);
}

export function scopedDelete(
  supabase: SupabaseClient, table: string, orgId: string,
) {
  validateOrgId(orgId);
  return supabase.from(table).delete().eq('org_id', orgId);
}

export function unscopedFrom(supabase: SupabaseClient, table: string) {
  return supabase.from(table);
}
