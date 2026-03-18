"use client";

import { Layers } from "lucide-react";
import { MiniKanban } from "@/components/kanban/MiniKanban";
import { useTranslation } from "@/lib/i18n";
import type { KanbanTask } from "@/store/slices/kanbanSlice";
import type { AgentLogEntry } from "@/store/slices/agentSlice";

interface RightPanelProps {
  tasks: KanbanTask[];
  logs?: AgentLogEntry[];
  onUpdateStatus: (id: string, status: KanbanTask['status']) => void;
}

export function RightPanel({ tasks, logs, onUpdateStatus }: RightPanelProps) {
  const { t } = useTranslation();
  const done = tasks.filter((tk) => tk.status === "done").length;
  const inProgress = tasks.filter((tk) => tk.status === "in-progress").length;
  const total = tasks.length;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)]">
      <div className="h-12 border-b border-[var(--border-subtle)] flex items-center px-4 bg-[var(--bg-glass)] backdrop-blur-sm">
        <Layers className="w-4 h-4 mr-2 text-[var(--text-muted)]" />
        <span className="text-xs font-mono font-bold tracking-wider text-[var(--text-primary)] uppercase">Kanban</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {total > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1">
              <span>{t('kanban.overallProgress')}</span>
              <span>{t('kanban.doneCount', { done: String(done), total: String(total) })}</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden flex">
              {done > 0 && (
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${(done / total) * 100}%` }}
                />
              )}
              {inProgress > 0 && (
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${(inProgress / total) * 100}%` }}
                />
              )}
            </div>
          </div>
        )}
        <MiniKanban tasks={tasks} logs={logs} onUpdateStatus={onUpdateStatus} />
      </div>
    </div>
  );
}
