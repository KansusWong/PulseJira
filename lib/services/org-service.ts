import 'server-only';
import { supabase } from '@/lib/db/client';

export async function createOrganization(name: string, slug: string, ownerUserId: string) {
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name, slug })
    .select()
    .single();
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await supabase
    .from('org_members')
    .insert({ org_id: org.id, user_id: ownerUserId, role: 'owner' });
  if (memberErr) throw new Error(`Failed to add owner: ${memberErr.message}`);

  return org;
}

export async function getOrganization(orgId: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();
  if (error) return null;
  return data;
}

export async function getOrgMembers(orgId: string) {
  const { data, error } = await supabase
    .from('org_members')
    .select('*, users(id, email, name, avatar_url)')
    .eq('org_id', orgId)
    .order('joined_at', { ascending: true });
  if (error) return [];
  return data || [];
}
