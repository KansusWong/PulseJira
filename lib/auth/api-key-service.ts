/**
 * API key lifecycle management (Node.js runtime).
 * Uses Node `crypto` module for key generation and hashing.
 */
import "server-only";
import crypto from "crypto";
import { supabase, assertSupabase } from "@/lib/db/client";
import {
  API_KEY_PREFIX,
  API_KEY_HEX_LENGTH,
  KEY_PREFIX_DISPLAY_LENGTH,
  type AuthRole,
} from "./constants";

/** Hash a raw API key using SHA-256 (hex digest). */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export interface CreateApiKeyInput {
  name: string;
  role: AuthRole;
  expiresAt?: string; // ISO 8601
  scopedProjectIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  role: AuthRole;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  scoped_project_ids: string[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Create a new API key. Returns the raw key (shown once) and the stored record.
 */
export async function createApiKey(
  input: CreateApiKeyInput
): Promise<{ rawKey: string; record: ApiKeyRecord }> {
  assertSupabase();

  const hexPart = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  const rawKey = `${API_KEY_PREFIX}${hexPart}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, KEY_PREFIX_DISPLAY_LENGTH);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      name: input.name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      role: input.role,
      expires_at: input.expiresAt || null,
      scoped_project_ids: input.scopedProjectIds || null,
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create API key: ${error.message}`);

  return { rawKey, record: data as ApiKeyRecord };
}

/**
 * List all API keys (never exposes raw keys — only prefixes).
 */
export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  assertSupabase();

  const { data, error } = await supabase
    .from("api_keys")
    .select(
      "id, name, key_prefix, role, is_active, expires_at, last_used_at, scoped_project_ids, metadata, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list API keys: ${error.message}`);

  return (data || []) as ApiKeyRecord[];
}

/**
 * Revoke an API key (soft-delete: sets is_active=false).
 */
export async function revokeApiKey(id: string): Promise<void> {
  assertSupabase();

  const { error } = await supabase
    .from("api_keys")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to revoke API key: ${error.message}`);
}

/**
 * Hard-delete an API key.
 */
export async function deleteApiKey(id: string): Promise<void> {
  assertSupabase();

  const { error } = await supabase.from("api_keys").delete().eq("id", id);

  if (error) throw new Error(`Failed to delete API key: ${error.message}`);
}

/**
 * Update an API key's role.
 */
export async function updateApiKeyRole(
  id: string,
  role: AuthRole
): Promise<ApiKeyRecord> {
  assertSupabase();

  const { data, error } = await supabase
    .from("api_keys")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to update API key role: ${error.message}`);

  return data as ApiKeyRecord;
}

/**
 * Update an API key's is_active status.
 */
export async function updateApiKeyStatus(
  id: string,
  isActive: boolean
): Promise<ApiKeyRecord> {
  assertSupabase();

  const { data, error } = await supabase
    .from("api_keys")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to update API key status: ${error.message}`);

  return data as ApiKeyRecord;
}

/**
 * Count total API keys (used by bootstrap endpoint).
 */
export async function countApiKeys(): Promise<number> {
  assertSupabase();

  const { count, error } = await supabase
    .from("api_keys")
    .select("*", { count: "exact", head: true });

  if (error) throw new Error(`Failed to count API keys: ${error.message}`);

  return count ?? 0;
}
