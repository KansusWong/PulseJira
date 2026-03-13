/**
 * memory-store — Supabase persistence layer for MemoryTool.
 *
 * Pattern: in-memory cache + fire-and-forget DB writes + lazy hydrate.
 * When Supabase is not configured, all DB operations silently skip.
 *
 * Reference: lib/blackboard/blackboard.ts (hydrate + persistEntry)
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Types (mirrors MemoryEntry in lib/tools/memory.ts)
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  content: string;
  tags: string[];
  category: 'fact' | 'procedure' | 'context';
  importance: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// DB row ↔ MemoryEntry mapping
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: string;
  project_id: string | null;
  workspace_id: string | null;
  content: string;
  tags: string[];
  category: string;
  importance: number;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    content: row.content,
    tags: row.tags || [],
    category: row.category as MemoryEntry['category'],
    importance: row.importance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function entryToRow(entry: MemoryEntry, projectId?: string): Partial<MemoryRow> {
  return {
    id: entry.id,
    project_id: projectId || null,
    content: entry.content,
    tags: entry.tags,
    category: entry.category,
    importance: entry.importance,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// MemoryStore singleton
// ---------------------------------------------------------------------------

class MemoryStore {
  /** In-memory cache keyed by projectId (or '_none_' for no-project). */
  private cache = new Map<string, MemoryEntry[]>();
  /** Track which projectIds have been hydrated. */
  private hydrated = new Set<string>();

  private cacheKey(projectId?: string): string {
    return projectId || '_none_';
  }

  /**
   * Hydrate from DB on first access. Returns cached entries on subsequent calls.
   */
  async hydrate(projectId?: string): Promise<MemoryEntry[]> {
    const key = this.cacheKey(projectId);

    if (this.hydrated.has(key)) {
      return this.cache.get(key) || [];
    }

    if (supabaseConfigured && projectId) {
      try {
        const { data, error } = await supabase
          .from('memory_entries')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          const entries = (data as MemoryRow[]).map(rowToEntry);
          // Merge with any entries already in memory (written before hydrate)
          const existing = this.cache.get(key) || [];
          const existingIds = new Set(existing.map(e => e.id));
          for (const entry of entries) {
            if (!existingIds.has(entry.id)) {
              existing.push(entry);
            }
          }
          this.cache.set(key, existing);
        }
      } catch (err) {
        console.error('[memory-store] hydrate failed:', (err as Error).message);
      }
    }

    this.hydrated.add(key);
    return this.cache.get(key) || [];
  }

  /**
   * Update the in-memory cache and fire-and-forget persist to DB.
   */
  persist(projectId: string | undefined, entry: MemoryEntry): void {
    const key = this.cacheKey(projectId);
    const entries = this.cache.get(key) || [];
    const idx = entries.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    this.cache.set(key, entries);

    // Fire-and-forget DB write
    if (supabaseConfigured && projectId) {
      supabase
        .from('memory_entries')
        .upsert(entryToRow(entry, projectId))
        .then(({ error }) => {
          if (error) console.error('[memory-store] persist failed:', error.message);
        });
    }
  }

  /**
   * Remove from in-memory cache and fire-and-forget delete from DB.
   */
  remove(projectId: string | undefined, id: string): void {
    const key = this.cacheKey(projectId);
    const entries = this.cache.get(key) || [];
    const idx = entries.findIndex(e => e.id === id);
    if (idx >= 0) {
      entries.splice(idx, 1);
      this.cache.set(key, entries);
    }

    // Fire-and-forget DB delete
    if (supabaseConfigured && projectId) {
      supabase
        .from('memory_entries')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[memory-store] remove failed:', error.message);
        });
    }
  }
}

export const memoryStore = new MemoryStore();
