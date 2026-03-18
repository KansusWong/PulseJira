import 'server-only';
import { supabase } from '@/lib/db/client';

export async function listOrgAssets(orgId: string, filters?: {
  type?: string;
  tag?: string;
  search?: string;
}) {
  let query = supabase
    .from('vault_artifacts')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'published')
    .order('reuse_count', { ascending: false });

  if (filters?.type) query = query.eq('artifact_type', filters.type);
  if (filters?.tag) query = query.contains('tags', [filters.tag]);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list assets: ${error.message}`);
  return data || [];
}

export async function publishAsset(assetId: string, publishedBy: string) {
  const { data, error } = await supabase
    .from('vault_artifacts')
    .update({
      status: 'published',
      visibility: 'org',
      published_by: publishedBy,
      published_at: new Date().toISOString(),
    })
    .eq('id', assetId)
    .eq('status', 'draft') // can only publish drafts
    .select()
    .single();

  if (error) throw new Error(`Failed to publish asset: ${error.message}`);
  return data;
}

export async function deprecateAsset(assetId: string) {
  const { data, error } = await supabase
    .from('vault_artifacts')
    .update({ status: 'deprecated' })
    .eq('id', assetId)
    .in('status', ['published'])
    .select()
    .single();

  if (error) throw new Error(`Failed to deprecate asset: ${error.message}`);
  return data;
}

export async function getAssetDetail(assetId: string, orgId: string) {
  const { data, error } = await supabase
    .from('vault_artifacts')
    .select('*')
    .eq('id', assetId)
    .eq('org_id', orgId)
    .single();

  if (error) return null;
  return data;
}
