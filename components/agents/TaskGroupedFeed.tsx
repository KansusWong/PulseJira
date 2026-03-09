"use client";

import { useMemo, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { TaskLogGroup } from "./TaskLogGroup";
import { AgentStepCard } from "./AgentStepCard";
import type { AgentLogEntry } from "@/store/slices/agentSlice";
import type { KanbanTask } from "@/store/slices/kanbanSlice";

interface TaskGroupedFeedProps {
  logs: AgentLogEntry[];
  tasks: KanbanTask[];
}

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

export function TaskGroupedFeed({ logs, tasks }: TaskGroupedFeedProps) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const { system, byTitle } = useMemo(() => groupLogsByTaskTitle(logs), [logs]);

  return (
    <div className="space-y-3">
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

      {tasks.map((task, i) => {
        const taskLogs = byTitle.get(task.title) || [];
        return (
          <TaskLogGroup
            key={task.id}
            title={task.title}
            status={task.status}
            logs={taskLogs}
            index={i + 1}
            total={tasks.length}
          />
        );
      })}

      <div ref={endRef} />
    </div>
  );
}
