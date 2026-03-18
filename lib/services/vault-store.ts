/**
 * vault-store — Supabase persistence layer for VaultTool.
 *
 * Pattern: fire-and-forget DB writes + lazy hydrate.
 * When Supabase is not configured, all DB operations silently skip.
 *
 * Reference: lib/services/memory-store.ts
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultArtifactEntry {
  artifact_id: string;
  type: 'skill' | 'tool' | 'doc' | 'pptx' | 'code';
  path: string;
  name: string;
  description: string;
  created_by_epic: string;
  created_by_agent: string;
  created_at: string;
  reuse_count: number;
  tags: string[];
  depends_on: string[];
  version: number;
}

// ---------------------------------------------------------------------------
// DB row ↔ VaultArtifactEntry mapping
// ---------------------------------------------------------------------------

interface VaultArtifactRow {
  id: string;
  project_id: string | null;
  org_id: string | null;
  artifact_type: string;
  path: string;
  name: string;
  description: string;
  created_by_epic: string;
  created_by_agent: string;
  reuse_count: number;
  tags: string[];
  depends_on: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: VaultArtifactRow): VaultArtifactEntry {
  return {
    artifact_id: row.id,
    type: row.artifact_type as VaultArtifactEntry['type'],
    path: row.path,
    name: row.name,
    description: row.description,
    created_by_epic: row.created_by_epic,
    created_by_agent: row.created_by_agent,
    created_at: row.created_at,
    reuse_count: row.reuse_count,
    tags: row.tags || [],
    depends_on: row.depends_on || [],
    version: row.version,
  };
}

function entryToRow(entry: VaultArtifactEntry, projectId?: string, orgId?: string): Partial<VaultArtifactRow> {
  return {
    id: entry.artifact_id,
    project_id: projectId || null,
    org_id: orgId || null,
    artifact_type: entry.type,
    path: entry.path,
    name: entry.name,
    description: entry.description,
    created_by_epic: entry.created_by_epic,
    created_by_agent: entry.created_by_agent,
    reuse_count: entry.reuse_count,
    tags: entry.tags,
    depends_on: entry.depends_on,
    version: entry.version,
    created_at: entry.created_at,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// VaultStore singleton
// ---------------------------------------------------------------------------

class VaultStore {
  /** In-memory cache keyed by projectId (or '_none_' for no-project). */
  private cache = new Map<string, VaultArtifactEntry[]>();
  /** Track which projectIds have been hydrated. */
  private hydrated = new Set<string>();

  private cacheKey(projectId?: string): string {
    return projectId || '_none_';
  }

  /**
   * Hydrate from DB on first access. Returns cached entries on subsequent calls.
   */
  async hydrate(projectId?: string): Promise<VaultArtifactEntry[]> {
    const key = this.cacheKey(projectId);

    if (this.hydrated.has(key)) {
      return this.cache.get(key) || [];
    }

    if (supabaseConfigured && projectId) {
      try {
        const { data, error } = await supabase
          .from('vault_artifacts')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          const entries = (data as VaultArtifactRow[]).map(rowToEntry);
          const existing = this.cache.get(key) || [];
          const existingIds = new Set(existing.map(e => e.artifact_id));
          for (const entry of entries) {
            if (!existingIds.has(entry.artifact_id)) {
              existing.push(entry);
            }
          }
          this.cache.set(key, existing);
        }
      } catch (err) {
        console.error('[vault-store] hydrate failed:', (err as Error).message);
      }
    }

    this.hydrated.add(key);
    return this.cache.get(key) || [];
  }

  /**
   * Update the in-memory cache and fire-and-forget persist to DB.
   */
  persist(projectId: string | undefined, entry: VaultArtifactEntry, orgId?: string): void {
    const key = this.cacheKey(projectId);
    const entries = this.cache.get(key) || [];
    const idx = entries.findIndex(e => e.artifact_id === entry.artifact_id);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    this.cache.set(key, entries);

    // Fire-and-forget DB write
    if (supabaseConfigured && projectId) {
      supabase
        .from('vault_artifacts')
        .upsert(entryToRow(entry, projectId, orgId))
        .then(({ error }) => {
          if (error) console.error('[vault-store] persist failed:', error.message);
        });
    }
  }

  /**
   * Remove from in-memory cache and fire-and-forget delete from DB.
   */
  remove(projectId: string | undefined, id: string): void {
    const key = this.cacheKey(projectId);
    const entries = this.cache.get(key) || [];
    const idx = entries.findIndex(e => e.artifact_id === id);
    if (idx >= 0) {
      entries.splice(idx, 1);
      this.cache.set(key, entries);
    }

    // Fire-and-forget DB delete
    if (supabaseConfigured && projectId) {
      supabase
        .from('vault_artifacts')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[vault-store] remove failed:', error.message);
        });
    }
  }
}

export const vaultStore = new VaultStore();
