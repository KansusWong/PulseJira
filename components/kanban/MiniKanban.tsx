"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { KanbanTask } from "@/store/slices/kanbanSlice";
import type { AgentLogEntry } from "@/store/slices/agentSlice";

interface MiniKanbanProps {
  tasks: KanbanTask[];
  logs?: AgentLogEntry[];
  onUpdateStatus: (id: string, status: KanbanTask['status']) => void;
}

const statusFlow: KanbanTask['status'][] = ['todo', 'in-progress', 'done'];

const columns: { key: KanbanTask['status']; label: string }[] = [
  { key: 'todo', label: 'TODO' },
  { key: 'in-progress', label: 'IN PROGRESS' },
  { key: 'done', label: 'DONE' },
];

const priorityDots: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

export function MiniKanban({ tasks, logs, onUpdateStatus }: MiniKanbanProps) {
  const lastLogByTitle = useMemo(() => {
    if (!logs?.length) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const log of logs) {
      if (log.taskTitle) map.set(log.taskTitle, log.message);
    }
    return map;
  }, [logs]);

  const movePrev = (task: KanbanTask) => {
    const idx = statusFlow.indexOf(task.status);
    if (idx > 0) onUpdateStatus(task.id, statusFlow[idx - 1]);
  };

  const moveNext = (task: KanbanTask) => {
    const idx = statusFlow.indexOf(task.status);
    if (idx < statusFlow.length - 1) onUpdateStatus(task.id, statusFlow[idx + 1]);
  };

  return (
    <div className="space-y-4">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.key);
        const colIdx = statusFlow.indexOf(col.key);
        const isInProgress = col.key === 'in-progress';
        return (
          <div key={col.key}>
            <div className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-wider mb-2">
              {col.label} ({colTasks.length})
            </div>
            <div className="space-y-1">
              {colTasks.map((task) => {
                const lastMsg = isInProgress ? lastLogByTitle.get(task.title) : undefined;
                return (
                  <div
                    key={task.id}
                    className={clsx(
                      "group p-2 bg-zinc-900/50 border rounded text-xs hover:border-zinc-600 transition-colors",
                      isInProgress ? "border-amber-500/30" : "border-border",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", priorityDots[task.priority || 'medium'])} />
                      <span className="text-zinc-300 truncate flex-1">{task.title}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {colIdx > 0 && (
                          <button
                            onClick={() => movePrev(task)}
                            className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors"
                            title={`Move to ${columns[colIdx - 1].label}`}
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </button>
                        )}
                        {colIdx < statusFlow.length - 1 && (
                          <button
                            onClick={() => moveNext(task)}
                            className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors"
                            title={`Move to ${columns[colIdx + 1].label}`}
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    {lastMsg && (
                      <div className="flex items-center gap-1.5 mt-1.5 ml-3.5">
                        <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-500 flex-shrink-0" />
                        <span className="text-[9px] text-zinc-500 truncate">{lastMsg}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {colTasks.length === 0 && (
                <div className="text-[10px] text-zinc-700 italic py-1">Empty</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
