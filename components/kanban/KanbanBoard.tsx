"use client";

import { KanbanColumn } from "./KanbanColumn";
import { useTranslation } from '@/lib/i18n';
import type { KanbanTask } from "@/store/slices/kanbanSlice";

interface KanbanBoardProps {
  tasks: KanbanTask[];
  onUpdateStatus?: (id: string, status: KanbanTask['status']) => void;
}

export function KanbanBoard({ tasks, onUpdateStatus }: KanbanBoardProps) {
  const { t } = useTranslation();
  const todo = tasks.filter((t) => t.status === "todo");
  const inProgress = tasks.filter((t) => t.status === "in-progress");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="flex gap-4 overflow-x-auto p-4 h-full">
      <KanbanColumn title={t('kanban.todo')} status="todo" tasks={todo} onUpdateStatus={onUpdateStatus} />
      <KanbanColumn title={t('kanban.inProgress')} status="in-progress" tasks={inProgress} onUpdateStatus={onUpdateStatus} />
      <KanbanColumn title={t('kanban.done')} status="done" tasks={done} onUpdateStatus={onUpdateStatus} />
    </div>
  );
}
