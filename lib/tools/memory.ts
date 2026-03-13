/**
 * MemoryTool — cross-session memory store for the agent.
 *
 * Supports 5 operations: store, recall, list, update, delete.
 * Persists to Supabase when configured (via memory-store service),
 * falls back to {workspace}/memories/entries.json otherwise.
 * Search uses a combined score: match_score * 0.6 + (importance/10) * 0.4
 */

import { z } from 'zod';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import { memoryStore } from '@/lib/services/memory-store';
import type { MemoryEntry } from '@/lib/services/memory-store';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');
// eslint-disable-next-line no-eval
const crypto: any = eval('require')('crypto');

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const MEMORY_DESC_V1 = `Cross-session memory for storing and recalling important information.
Five commands:
  - store: Save a new memory with content, tags, category, and importance (1-10)
  - recall: Search memories by query string (keyword + importance scoring)
  - list: List all memories (optionally filtered by tag or category)
  - update: Modify an existing memory by id
  - delete: Remove a memory by id
Categories: fact (default), procedure, context.
Memories are persisted to disk and survive across sessions.`;

const MEMORY_DESC_V2 = 'Store/recall/list/update/delete persistent memories. Scored search by keywords + importance.';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  command: z.enum(['store', 'recall', 'list', 'update', 'delete']).describe('Operation to perform'),
  content: z.string().optional().describe('Memory content (for store/update)'),
  tags: z.union([z.array(z.string()), z.string()]).optional().describe('Tags (array or comma-separated string)'),
  category: z.enum(['fact', 'procedure', 'context']).optional().default('fact').describe('Category (default: fact)'),
  importance: z.number().min(1).max(10).optional().default(5).describe('Importance 1-10 (default: 5)'),
  query: z.string().optional().describe('Search query (for recall)'),
  limit: z.number().optional().default(20).describe('Max results (for recall/list, default: 20)'),
  id: z.string().optional().describe('Memory ID (for update/delete)'),
});

type Input = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Persistence helpers (filesystem fallback)
// ---------------------------------------------------------------------------

function getMemoryFilePath(wsRoot: string): string {
  return path.join(wsRoot, 'memories', 'entries.json');
}

function loadMemories(wsRoot: string): MemoryEntry[] {
  const filePath = getMemoryFilePath(wsRoot);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveMemories(wsRoot: string, entries: MemoryEntry[]): void {
  const filePath = getMemoryFilePath(wsRoot);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
}

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// ---------------------------------------------------------------------------
// Search scoring
// ---------------------------------------------------------------------------

function scoreMemory(entry: MemoryEntry, query: string): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${entry.content} ${entry.tags.join(' ')} ${entry.category}`.toLowerCase();

  let matchScore = 0;
  for (const word of queryWords) {
    if (text.includes(word)) {
      matchScore += 1;
    }
  }

  // Normalize match score (0-1 range, based on query word count)
  const normalizedMatch = queryWords.length > 0 ? matchScore / queryWords.length : 0;

  // Combined score: match * 0.6 + importance * 0.4
  return normalizedMatch * 0.6 + (entry.importance / 10) * 0.4;
}

// ---------------------------------------------------------------------------
// Normalize tags
// ---------------------------------------------------------------------------

function normalizeTags(tags: string | string[] | undefined): string[] {
  if (!tags) return [];
  if (typeof tags === 'string') {
    return tags.split(',').map(t => t.trim()).filter(Boolean);
  }
  return tags;
}

// ---------------------------------------------------------------------------
// MemoryTool
// ---------------------------------------------------------------------------

export class MemoryTool extends BaseTool<Input, string> {
  name = 'memory';
  description = selectDesc(MEMORY_DESC_V1, MEMORY_DESC_V2);
  schema = schema;

  private workspaceRoot?: string;
  private projectId?: string;
  /** Whether DB-backed entries have been merged into the in-memory list. */
  private dbHydrated = false;

  constructor(cwd?: string, projectId?: string) {
    super();
    if (cwd) {
      this.workspaceRoot = path.normalize(cwd);
    }
    this.projectId = projectId;
    this.description = selectDesc(MEMORY_DESC_V1, MEMORY_DESC_V2);
  }

  /** Resolve the effective projectId from constructor or runtime context. */
  private getProjectId(ctx?: ToolContext): string | undefined {
    return this.projectId || ctx?.projectId;
  }

  /**
   * Ensure in-memory entries include DB data.
   * Only queries DB once per tool instance.
   */
  private async ensureHydrated(wsRoot: string, ctx?: ToolContext): Promise<MemoryEntry[]> {
    const pid = this.getProjectId(ctx);

    if (!this.dbHydrated && pid) {
      this.dbHydrated = true;
      const dbEntries = await memoryStore.hydrate(pid);
      // Merge: DB entries that are not already on disk
      const fsEntries = loadMemories(wsRoot);
      const fsIds = new Set(fsEntries.map(e => e.id));
      for (const entry of dbEntries) {
        if (!fsIds.has(entry.id)) {
          fsEntries.push(entry);
        }
      }
      return fsEntries;
    }

    return loadMemories(wsRoot);
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const wsRoot = this.workspaceRoot || ctx?.workspacePath || '.';

    switch (input.command) {
      case 'store':
        return this._store(wsRoot, input, ctx);
      case 'recall':
        return this._recall(wsRoot, input, ctx);
      case 'list':
        return this._list(wsRoot, input, ctx);
      case 'update':
        return this._update(wsRoot, input, ctx);
      case 'delete':
        return this._delete(wsRoot, input, ctx);
      default:
        return `Error: Unknown command "${input.command}". Use: store, recall, list, update, delete.`;
    }
  }

  private _store(wsRoot: string, input: Input, ctx?: ToolContext): string {
    if (!input.content) {
      return 'Error: content is required for store command.';
    }

    const entries = loadMemories(wsRoot);
    const now = new Date().toISOString();

    const entry: MemoryEntry = {
      id: generateId(),
      content: input.content,
      tags: normalizeTags(input.tags),
      category: input.category || 'fact',
      importance: input.importance ?? 5,
      createdAt: now,
      updatedAt: now,
    };

    entries.push(entry);
    saveMemories(wsRoot, entries);

    // Persist to DB (fire-and-forget)
    const pid = this.getProjectId(ctx);
    memoryStore.persist(pid, entry);

    return `\u2713 \u5DF2\u5B58\u50A8\u8BB0\u5FC6 [${entry.id}]: "${entry.content.slice(0, 50)}${entry.content.length > 50 ? '...' : ''}" (tags: ${entry.tags.join(', ') || 'none'}, importance: ${entry.importance})`;
  }

  private async _recall(wsRoot: string, input: Input, ctx?: ToolContext): Promise<string> {
    if (!input.query) {
      return 'Error: query is required for recall command.';
    }

    const entries = await this.ensureHydrated(wsRoot, ctx);
    if (entries.length === 0) {
      return '\u6CA1\u6709\u5B58\u50A8\u7684\u8BB0\u5FC6\u3002';
    }

    // Score and sort
    const scored = entries.map(e => ({
      entry: e,
      score: scoreMemory(e, input.query!),
    }));

    scored.sort((a, b) => b.score - a.score);

    // Filter out zero scores and limit
    const limit = input.limit || 20;
    const results = scored
      .filter(s => s.score > 0)
      .slice(0, limit);

    if (results.length === 0) {
      return `\u672A\u627E\u5230\u4E0E "${input.query}" \u76F8\u5173\u7684\u8BB0\u5FC6\u3002`;
    }

    const lines = results.map(({ entry, score }) => {
      const tags = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
      return `[${entry.id}] (score: ${score.toFixed(2)}, imp: ${entry.importance})${tags}\n  ${entry.content}`;
    });

    return `\u627E\u5230 ${results.length} \u6761\u76F8\u5173\u8BB0\u5FC6:\n\n${lines.join('\n\n')}`;
  }

  private async _list(wsRoot: string, input: Input, ctx?: ToolContext): Promise<string> {
    let entries = await this.ensureHydrated(wsRoot, ctx);

    if (entries.length === 0) {
      return '\u6CA1\u6709\u5B58\u50A8\u7684\u8BB0\u5FC6\u3002';
    }

    // Filter by tag
    const tags = normalizeTags(input.tags);
    if (tags.length > 0) {
      entries = entries.filter(e =>
        tags.some(t => e.tags.includes(t))
      );
    }

    // Filter by category
    if (input.category) {
      entries = entries.filter(e => e.category === input.category);
    }

    const limit = input.limit || 20;
    const shown = entries.slice(0, limit);

    if (shown.length === 0) {
      return '\u6CA1\u6709\u5339\u914D\u7684\u8BB0\u5FC6\u3002';
    }

    const lines = shown.map(e => {
      const tags = e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : '';
      return `[${e.id}] (${e.category}, imp: ${e.importance})${tags} ${e.content.slice(0, 60)}${e.content.length > 60 ? '...' : ''}`;
    });

    let output = `\u8BB0\u5FC6\u5217\u8868 (${shown.length}/${entries.length}):\n\n${lines.join('\n')}`;
    if (entries.length > limit) {
      output += `\n\n(\u8FD8\u6709 ${entries.length - limit} \u6761\u672A\u663E\u793A)`;
    }

    return output;
  }

  private _update(wsRoot: string, input: Input, ctx?: ToolContext): string {
    if (!input.id) {
      return 'Error: id is required for update command.';
    }

    const entries = loadMemories(wsRoot);
    const idx = entries.findIndex(e => e.id === input.id);

    if (idx < 0) {
      return `Error: \u672A\u627E\u5230 ID \u4E3A "${input.id}" \u7684\u8BB0\u5FC6\u3002`;
    }

    const entry = entries[idx];
    const now = new Date().toISOString();

    if (input.content !== undefined) entry.content = input.content;
    if (input.tags !== undefined) entry.tags = normalizeTags(input.tags);
    if (input.category !== undefined) entry.category = input.category || entry.category;
    if (input.importance !== undefined) entry.importance = input.importance;
    entry.updatedAt = now;

    saveMemories(wsRoot, entries);

    // Persist to DB (fire-and-forget)
    const pid = this.getProjectId(ctx);
    memoryStore.persist(pid, entry);

    return `\u2713 \u5DF2\u66F4\u65B0\u8BB0\u5FC6 [${entry.id}]: "${entry.content.slice(0, 50)}${entry.content.length > 50 ? '...' : ''}"`;
  }

  private _delete(wsRoot: string, input: Input, ctx?: ToolContext): string {
    if (!input.id) {
      return 'Error: id is required for delete command.';
    }

    const entries = loadMemories(wsRoot);
    const idx = entries.findIndex(e => e.id === input.id);

    if (idx < 0) {
      return `Error: \u672A\u627E\u5230 ID \u4E3A "${input.id}" \u7684\u8BB0\u5FC6\u3002`;
    }

    const removed = entries.splice(idx, 1)[0];
    saveMemories(wsRoot, entries);

    // Remove from DB (fire-and-forget)
    const pid = this.getProjectId(ctx);
    memoryStore.remove(pid, removed.id);

    return `\u2713 \u5DF2\u5220\u9664\u8BB0\u5FC6 [${removed.id}]: "${removed.content.slice(0, 50)}${removed.content.length > 50 ? '...' : ''}"`;
  }
}
