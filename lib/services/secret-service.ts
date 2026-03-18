import 'server-only';
import crypto from 'crypto';
import { supabase } from '@/lib/db/client';

function getEncryptionKey(): Buffer {
  const hex = process.env.PLATFORM_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('PLATFORM_ENCRYPTION_KEY must be a 64-char hex string (256-bit)');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(stored: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(stored, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
}

/**
 * Resolve decrypted API keys for a provider, scoped to an org.
 * Priority: org-level keys > platform-level keys.
 */
export async function resolveProviderKeys(
  provider: string,
  orgId: string,
): Promise<{ keyName: string; apiKey: string; priority: number }[]> {
  // Try org-level first
  const { data: orgKeys } = await supabase
    .from('platform_secrets')
    .select('key_name, encrypted_value, priority')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (orgKeys && orgKeys.length > 0) {
    return orgKeys.map((k) => ({
      keyName: k.key_name,
      apiKey: decrypt(k.encrypted_value),
      priority: k.priority,
    }));
  }

  // Fallback to platform-level
  const { data: platformKeys } = await supabase
    .from('platform_secrets')
    .select('key_name, encrypted_value, priority')
    .is('org_id', null)
    .eq('provider', provider)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  return (platformKeys || []).map((k) => ({
    keyName: k.key_name,
    apiKey: decrypt(k.encrypted_value),
    priority: k.priority,
  }));
}

/**
 * Store a new secret (encrypted).
 */
export async function storeSecret(params: {
  orgId: string | null;
  keyName: string;
  plainValue: string;
  provider: string;
  priority?: number;
  createdBy?: string;
}) {
  const encrypted = encrypt(params.plainValue);
  const row = {
    org_id: params.orgId,
    key_name: params.keyName,
    encrypted_value: encrypted,
    provider: params.provider,
    priority: params.priority ?? 0,
    created_by: params.createdBy,
    key_version: 1,
  };

  // PostgreSQL UNIQUE treats NULL as distinct, so upsert on (org_id, key_name)
  // won't match rows where org_id IS NULL. Handle platform-level keys explicitly.
  let query;
  if (params.orgId) {
    query = supabase
      .from('platform_secrets')
      .upsert(row, { onConflict: 'org_id,key_name' })
      .select()
      .single();
  } else {
    // Check if platform-level key already exists
    const { data: existing } = await supabase
      .from('platform_secrets')
      .select('id')
      .is('org_id', null)
      .eq('key_name', params.keyName)
      .single();

    if (existing) {
      query = supabase
        .from('platform_secrets')
        .update({ encrypted_value: encrypted, provider: row.provider, priority: row.priority, key_version: row.key_version })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      query = supabase
        .from('platform_secrets')
        .insert(row)
        .select()
        .single();
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to store secret: ${error.message}`);
  return data;
}
