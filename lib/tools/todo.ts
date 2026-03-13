/**
 * Todo tools — todo_write and todo_read.
 * Manages a per-conversation task list for tracking multi-step work.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import { todoDbStore } from '@/lib/services/todo-store';

// =====================================================================
// Types & TodoList class
// =====================================================================

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * TodoList — wraps an array of TodoItems with helper methods.
 */
export class TodoList {
  items: TodoItem[];

  constructor(items: TodoItem[] = []) {
    this.items = items;
  }

  getItem(id: string): TodoItem | undefined {
    return this.items.find(t => t.id === id);
  }

  toMarkdown(): string {
    if (this.items.length === 0) return '';

    const statusIcons: Record<string, string> = {
      pending: '\u2B1C',
      in_progress: '\uD83D\uDD04',
      completed: '\u2705',
      cancelled: '\u274C',
    };

    const lines = this.items.map(t => {
      const icon = statusIcons[t.status] || '\u2B1C';
      const deps = t.dependencies.length > 0 ? ` (depends on: ${t.dependencies.join(', ')})` : '';
      return `${icon} [${t.id}] ${t.content}${deps}`;
    });

    const pending = this.items.filter(t => t.status === 'pending').length;
    const inProgress = this.items.filter(t => t.status === 'in_progress').length;
    const completed = this.items.filter(t => t.status === 'completed').length;

    return `## Task List\n\n${lines.join('\n')}\n\n---\nProgress: ${completed}/${this.items.length} completed | ${inProgress} in progress | ${pending} pending`;
  }
}

/** In-memory todo store, keyed by conversationId. */
const todoStore = new Map<string, TodoList>();

function getTodoList(conversationId: string): TodoList {
  if (!todoStore.has(conversationId)) {
    todoStore.set(conversationId, new TodoList());
  }
  return todoStore.get(conversationId)!;
}

/**
 * Get active (non-completed) todo snapshot as Markdown.
 * Returns null if no active items exist.
 * Used for context compression protection.
 */
export function getActiveTodoSnapshot(sessionId?: string): string | null {
  const key = sessionId || 'default';
  const todoList = todoStore.get(key);
  if (!todoList?.items.length) return null;
  if (!todoList.items.some(i => ['pending', 'in_progress'].includes(i.status))) return null;
  return todoList.toMarkdown();
}

// =====================================================================
// TodoWriteTool
// =====================================================================

const TODO_WRITE_DESC_V1 = `Create or update a task list for tracking multi-step work.
Use merge=true to update specific tasks without replacing the whole list.
Each task has: id, content, status (pending/in_progress/completed/cancelled), and optional dependencies.
Statuses: pending (not started), in_progress (working on), completed (done), cancelled (skipped).`;

const TODO_WRITE_DESC_V2 = 'Create/update task list. Use merge=true to update specific tasks.';

const todoItemSchema = z.object({
  id: z.string().describe('Unique identifier for this task'),
  content: z.string().describe('Task description'),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).default('pending'),
  dependencies: z.array(z.string()).optional().default([]).describe('IDs of tasks this depends on'),
});

const writeSchema = z.object({
  todos: z.array(todoItemSchema).min(1).describe('Tasks to write/update'),
  merge: z.boolean().optional().default(false).describe('If true, merge with existing list; if false, replace entire list'),
});

type WriteInput = z.infer<typeof writeSchema>;

export class TodoWriteTool extends BaseTool<WriteInput, string> {
  name = 'todo_write';
  description = selectDesc(TODO_WRITE_DESC_V1, TODO_WRITE_DESC_V2);
  schema = writeSchema;

  constructor() {
    super();
    this.description = selectDesc(TODO_WRITE_DESC_V1, TODO_WRITE_DESC_V2);
  }

  protected async _run(input: WriteInput, ctx?: ToolContext): Promise<string> {
    const conversationId = ctx?.sessionId || 'default';
    const now = new Date().toISOString();

    const newTodos: TodoItem[] = input.todos.map(t => ({
      id: t.id,
      content: t.content,
      status: t.status || 'pending',
      dependencies: t.dependencies || [],
      createdAt: now,
      updatedAt: now,
    }));

    if (input.merge) {
      const todoList = getTodoList(conversationId);
      const existingMap = new Map(todoList.items.map(t => [t.id, t]));

      for (const todo of newTodos) {
        const prev = existingMap.get(todo.id);
        if (prev) {
          existingMap.set(todo.id, { ...todo, createdAt: prev.createdAt, updatedAt: now });
        } else {
          existingMap.set(todo.id, todo);
        }
      }

      todoStore.set(conversationId, new TodoList(Array.from(existingMap.values())));
    } else {
      todoStore.set(conversationId, new TodoList(newTodos));
    }

    const todoList = getTodoList(conversationId);
    const pending = todoList.items.filter(t => t.status === 'pending').length;
    const inProgress = todoList.items.filter(t => t.status === 'in_progress').length;
    const completed = todoList.items.filter(t => t.status === 'completed').length;
    const cancelled = todoList.items.filter(t => t.status === 'cancelled').length;

    // Persist to DB (fire-and-forget)
    todoDbStore.persistAll(conversationId, todoList.items, ctx?.projectId);

    return `\u2713 Task list updated: ${todoList.items.length} tasks (${pending} pending, ${inProgress} in progress, ${completed} completed, ${cancelled} cancelled)`;
  }
}

// =====================================================================
// TodoReadTool
// =====================================================================

const TODO_READ_DESC_V1 = `Read the current task list.
Returns all tasks with their status, dependencies, and progress summary in Markdown format.
Status icons: \u2B1C pending, \uD83D\uDD04 in progress, \u2705 completed, \u274C cancelled.`;

const TODO_READ_DESC_V2 = 'Read current task list with status and progress.';

const readSchema = z.object({}).passthrough();

export class TodoReadTool extends BaseTool<any, string> {
  name = 'todo_read';
  description = selectDesc(TODO_READ_DESC_V1, TODO_READ_DESC_V2);
  schema = readSchema;

  constructor() {
    super();
    this.description = selectDesc(TODO_READ_DESC_V1, TODO_READ_DESC_V2);
  }

  protected async _run(_input: any, ctx?: ToolContext): Promise<string> {
    const conversationId = ctx?.sessionId || 'default';
    let todoList = getTodoList(conversationId);

    // Hydrate from DB if in-memory list is empty (session restored)
    if (todoList.items.length === 0) {
      const dbItems = await todoDbStore.hydrate(conversationId, ctx?.projectId);
      if (dbItems.length > 0) {
        todoStore.set(conversationId, new TodoList(dbItems));
        todoList = todoStore.get(conversationId)!;
      }
    }

    if (todoList.items.length === 0) {
      return 'No tasks in the list. Use todo_write to create tasks.';
    }

    return todoList.toMarkdown();
  }
}
