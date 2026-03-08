import { z } from 'zod';

// ---------------------------------------------------------------------------
// Entry type taxonomy
// ---------------------------------------------------------------------------

export type BlackboardEntryType =
  | 'decision'
  | 'artifact'
  | 'question'
  | 'status'
  | 'constraint'
  | 'context'
  | 'feedback';

// ---------------------------------------------------------------------------
// Single blackboard entry
// ---------------------------------------------------------------------------

export interface BlackboardEntry {
  id: string;
  executionId: string;
  projectId: string | null;
  type: BlackboardEntryType;
  /** Namespaced key, e.g. "pm.prd", "developer.task-3.summary" */
  key: string;
  value: unknown;
  author: string;
  /** Monotonically increasing per key within the same execution. */
  version: number;
  tags: string[];
  /** ID of the entry this one replaces (audit trail). */
  supersedes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Query / filter
// ---------------------------------------------------------------------------

export interface BlackboardQuery {
  key?: string;
  keyPrefix?: string;
  type?: BlackboardEntryType | BlackboardEntryType[];
  tags?: string[];
  author?: string;
  since?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Change event (for MessageBus integration)
// ---------------------------------------------------------------------------

export interface BlackboardChangeEvent {
  entry: BlackboardEntry;
  action: 'write' | 'update' | 'delete' | 'evict';
  previousVersion?: number;
}

// ---------------------------------------------------------------------------
// Snapshot: frozen read-only view for single-shot agents
// ---------------------------------------------------------------------------

export interface BlackboardSnapshot {
  executionId: string;
  projectId: string | null;
  entries: BlackboardEntry[];
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Lifecycle configuration
// ---------------------------------------------------------------------------

export interface BlackboardConfig {
  /** Maximum number of entries before capacity eviction. 0 = unlimited. */
  maxEntries?: number;
  /** Entry time-to-live in milliseconds. 0 = no TTL. */
  ttlMs?: number;
}

// ---------------------------------------------------------------------------
// Zod schemas for tool input validation
// ---------------------------------------------------------------------------

const ENTRY_TYPES = [
  'decision',
  'artifact',
  'question',
  'status',
  'constraint',
  'context',
  'feedback',
] as const;

export const BlackboardWriteInputSchema = z.object({
  key: z
    .string()
    .describe(
      'Namespaced key for the entry (e.g. "pm.prd", "developer.task-3.summary")',
    ),
  value: z.any().describe('JSON-serializable data to store'),
  type: z
    .enum(ENTRY_TYPES)
    .describe('Category of this blackboard entry'),
  tags: z
    .array(z.string())
    .default([])
    .describe('Optional tags for filtering (e.g. ["task-3", "architecture"])'),
});

export const BlackboardReadInputSchema = z.object({
  key: z
    .string()
    .optional()
    .describe('Exact key to read. Omit to use query filters instead.'),
  keyPrefix: z
    .string()
    .optional()
    .describe('Read all entries whose key starts with this prefix'),
  type: z
    .enum(ENTRY_TYPES)
    .optional()
    .describe('Filter by entry type'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Filter entries that have ALL of these tags'),
  author: z
    .string()
    .optional()
    .describe('Filter by the agent that wrote the entry'),
  limit: z
    .number()
    .default(20)
    .describe('Maximum number of entries to return'),
});

export type BlackboardWriteInput = z.infer<typeof BlackboardWriteInputSchema>;
export type BlackboardReadInput = z.infer<typeof BlackboardReadInputSchema>;
