import crypto from 'crypto';
import { messageBus } from '@/connectors/bus/message-bus';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { CHANNELS } from '@/connectors/bus/channels';
import type {
  BlackboardEntry,
  BlackboardEntryType,
  BlackboardQuery,
  BlackboardChangeEvent,
  BlackboardSnapshot,
} from './types';

/**
 * Shared Blackboard — inter-agent state space scoped to a single pipeline execution.
 *
 * Design:
 * - In-memory Map is the source of truth during execution (fast reads).
 * - DB writes are fire-and-forget (never blocks pipeline).
 * - Every write publishes a change event to the MessageBus for SSE streaming.
 * - On pipeline resume, call hydrate() to restore state from DB.
 */
export class Blackboard {
  private entries: Map<string, BlackboardEntry> = new Map();
  readonly executionId: string;
  readonly projectId: string | null;

  constructor(executionId: string, projectId?: string | null) {
    this.executionId = executionId;
    this.projectId = projectId ?? null;
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  async write(params: {
    key: string;
    value: unknown;
    type: BlackboardEntryType;
    author: string;
    tags?: string[];
  }): Promise<BlackboardEntry> {
    const existing = this.entries.get(params.key);
    const now = new Date().toISOString();

    const entry: BlackboardEntry = {
      id: crypto.randomUUID(),
      executionId: this.executionId,
      projectId: this.projectId,
      type: params.type,
      key: params.key,
      value: params.value,
      author: params.author,
      version: existing ? existing.version + 1 : 1,
      tags: params.tags ?? [],
      supersedes: existing?.id,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    this.entries.set(params.key, entry);

    // Publish change to MessageBus (auto-broadcasts to agent-log for SSE)
    const event: BlackboardChangeEvent = {
      entry,
      action: existing ? 'update' : 'write',
      previousVersion: existing?.version,
    };
    messageBus.publish({
      from: params.author,
      channel: CHANNELS.BLACKBOARD,
      type: 'blackboard_change',
      payload: event,
    });

    // Async DB persist — fire-and-forget
    this.persistEntry(entry).catch((err) =>
      console.error('[Blackboard] DB persist failed:', err),
    );

    return entry;
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  /** Read a single entry by exact key. */
  read(key: string): BlackboardEntry | undefined {
    return this.entries.get(key);
  }

  /** Query entries with filters. */
  query(q: BlackboardQuery): BlackboardEntry[] {
    if (q.key) {
      const entry = this.entries.get(q.key);
      return entry ? [entry] : [];
    }

    let results = Array.from(this.entries.values());

    if (q.keyPrefix) {
      results = results.filter((e) => e.key.startsWith(q.keyPrefix!));
    }
    if (q.type) {
      const types = Array.isArray(q.type) ? q.type : [q.type];
      results = results.filter((e) =>
        (types as BlackboardEntryType[]).includes(e.type),
      );
    }
    if (q.tags && q.tags.length > 0) {
      results = results.filter((e) =>
        q.tags!.every((t) => e.tags.includes(t)),
      );
    }
    if (q.author) {
      results = results.filter((e) => e.author === q.author);
    }
    if (q.since) {
      results = results.filter((e) => e.updatedAt > q.since!);
    }

    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (q.limit) {
      results = results.slice(0, q.limit);
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Snapshot (for prompt injection into single-shot agents)
  // -----------------------------------------------------------------------

  snapshot(filter?: BlackboardQuery): BlackboardSnapshot {
    const entries = filter
      ? this.query(filter)
      : Array.from(this.entries.values());
    return {
      executionId: this.executionId,
      projectId: this.projectId,
      entries,
      capturedAt: new Date().toISOString(),
    };
  }

  /** Serialize a filtered snapshot into a compact string for prompt injection. */
  toContextString(filter?: BlackboardQuery): string {
    const snap = this.snapshot(filter);
    if (snap.entries.length === 0) return '(blackboard is empty)';

    return snap.entries
      .map((e) => {
        const valueStr =
          typeof e.value === 'string'
            ? e.value
            : JSON.stringify(e.value, null, 2);
        return `[${e.type}] ${e.key} (by ${e.author}, v${e.version}):\n${valueStr}`;
      })
      .join('\n\n---\n\n');
  }

  /** Number of entries currently held. */
  get size(): number {
    return this.entries.size;
  }

  // -----------------------------------------------------------------------
  // Hydrate from DB (for pipeline resume)
  // -----------------------------------------------------------------------

  async hydrate(): Promise<void> {
    if (!supabaseConfigured) return;

    const { data, error } = await supabase
      .from('blackboard_entries')
      .select('*')
      .eq('execution_id', this.executionId)
      .order('updated_at', { ascending: true });

    if (error) {
      console.error('[Blackboard] Hydrate failed:', error);
      return;
    }

    for (const row of data || []) {
      const entry: BlackboardEntry = {
        id: row.id,
        executionId: row.execution_id,
        projectId: row.project_id,
        type: row.type,
        key: row.key,
        value: row.value,
        author: row.author,
        version: row.version,
        tags: row.tags || [],
        supersedes: row.supersedes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      const existing = this.entries.get(entry.key);
      if (!existing || entry.version > existing.version) {
        this.entries.set(entry.key, entry);
      }
    }
  }

  // -----------------------------------------------------------------------
  // DB persistence (fire-and-forget)
  // -----------------------------------------------------------------------

  private async persistEntry(entry: BlackboardEntry): Promise<void> {
    if (!supabaseConfigured) return;

    await supabase.from('blackboard_entries').upsert({
      id: entry.id,
      execution_id: entry.executionId,
      project_id: entry.projectId || null,
      type: entry.type,
      key: entry.key,
      value: entry.value,
      author: entry.author,
      version: entry.version,
      tags: entry.tags,
      supersedes: entry.supersedes,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
    });
  }
}
