/**
 * todo-store — Supabase persistence layer for TodoWriteTool / TodoReadTool.
 *
 * Pattern: in-memory Map remains the primary store; this service provides
 * hydrate (lazy load from DB) and persistAll (batch fire-and-forget upsert).
 * When Supabase is not configured, all DB operations silently skip.
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import type { TodoItem } from '@/lib/tools/todo';

// ---------------------------------------------------------------------------
// DB row ↔ TodoItem mapping
// ---------------------------------------------------------------------------

interface TodoRow {
  id: string;
  conversation_id: string;
  project_id: string | null;
  content: string;
  status: string;
  dependencies: string[];
  created_at: string;
  updated_at: string;
}

function rowToItem(row: TodoRow): TodoItem {
  return {
    id: row.id,
    content: row.content,
    status: row.status as TodoItem['status'],
    dependencies: row.dependencies || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemToRow(
  item: TodoItem,
  conversationId: string,
  projectId?: string,
): TodoRow {
  return {
    id: item.id,
    conversation_id: conversationId,
    project_id: projectId || null,
    content: item.content,
    status: item.status,
    dependencies: item.dependencies,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// TodoDbStore singleton
// ---------------------------------------------------------------------------

class TodoDbStore {
  /** Track which conversationIds have been hydrated. */
  private hydrated = new Set<string>();

  /**
   * Load todo items from DB for a conversation. Only queries DB on the first
   * call per conversationId; subsequent calls return empty (caller owns cache).
   */
  async hydrate(
    conversationId: string,
    projectId?: string,
  ): Promise<TodoItem[]> {
    if (this.hydrated.has(conversationId)) {
      return [];
    }

    this.hydrated.add(conversationId);

    if (!supabaseConfigured) return [];

    try {
      const { data, error } = await supabase
        .from('todo_items')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[todo-store] hydrate failed:', error.message);
        return [];
      }

      return (data as TodoRow[] || []).map(rowToItem);
    } catch (err) {
      console.error('[todo-store] hydrate failed:', (err as Error).message);
      return [];
    }
  }

  /**
   * Batch upsert all todo items for a conversation. Fire-and-forget.
   */
  persistAll(
    conversationId: string,
    items: TodoItem[],
    projectId?: string,
  ): void {
    if (!supabaseConfigured || items.length === 0) return;

    const rows = items.map(item => itemToRow(item, conversationId, projectId));

    supabase
      .from('todo_items')
      .upsert(rows, { onConflict: 'conversation_id,id' })
      .then(({ error }) => {
        if (error) console.error('[todo-store] persistAll failed:', error.message);
      });
  }
}

export const todoDbStore = new TodoDbStore();
