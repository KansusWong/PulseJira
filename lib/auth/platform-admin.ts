import 'server-only';
import { supabase } from '@/lib/db/client';

const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Check if a user is a platform administrator.
 * Platform admin = owner or admin of the system organization.
 */
export async function isPlatformAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;

  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', SYSTEM_ORG_ID)
    .in('role', ['owner', 'admin'])
    .single();

  return !!data;
}
