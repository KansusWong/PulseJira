import 'server-only';
import { supabase } from '@/lib/db/client';

export interface OrgContext {
  userId: string;
  orgId: string;
  orgRole: 'owner' | 'admin' | 'member' | 'viewer';
}

export async function resolveOrgContext(
  userId: string,
  orgId: string,
): Promise<OrgContext | null> {
  const { data, error } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .single();

  if (error || !data) return null;

  return {
    userId,
    orgId,
    orgRole: data.role as OrgContext['orgRole'],
  };
}

export async function getUserOrgs(userId: string) {
  const { data, error } = await supabase
    .from('org_members')
    .select('org_id, role, organizations(id, name, slug)')
    .eq('user_id', userId);

  if (error) return [];
  return data || [];
}
