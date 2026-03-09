"use client";

import { useMemo } from "react";
import { Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { TaskLogGroup } from "@/components/agents/TaskLogGroup";
import { AgentStepCard } from "@/components/agents/AgentStepCard";
import { useTranslation } from "@/lib/i18n";
import type { KanbanTask } from "@/store/slices/kanbanSlice";
import type { AgentLogEntry } from "@/store/slices/agentSlice";

interface TasksPageViewProps {
  tasks: KanbanTask[];
  logs: AgentLogEntry[];
  isRunning: boolean;
  isImplementStage: boolean;
  onUpdateStatus: (id: string, status: KanbanTask["status"]) => void;
  onRetry?: () => void;
}

function getColumns(t: (key: string) => string): { key: KanbanTask["status"]; label: string; color: string }[] {
  return [
    { key: "in-progress", label: t('kanban.inProgress'), color: "text-amber-400" },
    { key: "todo", label: t('kanban.todo'), color: "text-zinc-400" },
    { key: "done", label: t('kanban.done'), color: "text-green-400" },
  ];
}

const statusIcons: Record<string, React.ReactNode> = {
  todo: <AlertCircle className="w-3.5 h-3.5 text-zinc-500" />,
  "in-progress": <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />,
  done: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
};

function groupLogsByTaskTitle(logs: AgentLogEntry[]) {
  const system: AgentLogEntry[] = [];
  const byTitle = new Map<string, AgentLogEntry[]>();

  for (const log of logs) {
    if (log.taskTitle) {
      const list = byTitle.get(log.taskTitle) || [];
      list.push(log);
      byTitle.set(log.taskTitle, list);
    } else {
      system.push(log);
    }
  }

  return { system, byTitle };
}

export function TasksPageView({
  tasks,
  logs,
  isRunning,
  isImplementStage,
  onUpdateStatus,
  onRetry,
}: TasksPageViewProps) {
  const { t } = useTranslation();
  const columns = useMemo(() => getColumns(t), [t]);
  const done = tasks.filter((tk) => tk.status === "done").length;
  const inProgress = tasks.filter((tk) => tk.status === "in-progress").length;
  const total = tasks.length;

  const { system, byTitle } = useMemo(() => groupLogsByTaskTitle(logs), [logs]);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-10 h-10 text-zinc-800 mb-3" />
        <p className="text-sm text-zinc-600">{t('kanban.noDevTasks')}</p>
        <p className="text-xs text-zinc-700 mt-1">{t('kanban.noDevTasksHint')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Progress overview */}
      <div className="bg-zinc-900/50 border border-border rounded-lg p-4">
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
          <span className="font-medium">{t('kanban.overallProgress')}</span>
          <div className="flex items-center gap-3">
            <span className="font-mono">{t('kanban.doneCount', { done: String(done), total: String(total) })}</span>
            {!isRunning && onRetry && done < total && done > 0 && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                {t('kanban.continueExecution')}
              </button>
            )}
          </div>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden flex">
          {done > 0 && (
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${(done / total) * 100}%` }}
            />
          )}
          {inProgress > 0 && (
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${(inProgress / total) * 100}%` }}
            />
          )}
        </div>
        <div className="flex gap-4 mt-2">
          {columns.map((col) => {
            const count = tasks.filter((t) => t.status === col.key).length;
            return (
              <div key={col.key} className="flex items-center gap-1.5 text-[10px]">
                {statusIcons[col.key]}
                <span className={col.color}>{col.label}</span>
                <span className="text-zinc-600 font-mono">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* System logs (if any) */}
      {system.length > 0 && (
        <div className="border border-border rounded-lg bg-paper/30 overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-wider border-b border-border">
            {t('kanban.systemLogs')}
          </div>
          <div className="px-4 py-2 space-y-1 max-h-40 overflow-y-auto">
            {system.map((entry) => (
              <AgentStepCard
                key={entry.id}
                agent={entry.agent}
                message={entry.message}
                type={entry.type}
                timestamp={entry.timestamp}
              />
            ))}
          </div>
        </div>
      )}

      {/* Task list with expandable logs */}
      <div className="space-y-2">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          if (colTasks.length === 0) return null;

          return (
            <div key={col.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className={clsx(
                  "text-[10px] font-mono font-bold uppercase tracking-wider",
                  col.color,
                )}>
                  {col.label} ({colTasks.length})
                </div>
              </div>

              {colTasks.map((task, i) => {
                const taskLogs = byTitle.get(task.title) || [];
                return (
                  <TaskLogGroup
                    key={task.id}
                    title={task.title}
                    status={task.status}
                    logs={taskLogs}
                    index={i + 1}
                    total={colTasks.length}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
