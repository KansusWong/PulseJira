"use client";

import { motion } from "framer-motion";
import { KanbanCard } from "./KanbanCard";
import { useTranslation } from '@/lib/i18n';
import type { KanbanTask } from "@/store/slices/kanbanSlice";

const MotionDiv = motion.div;

interface KanbanColumnProps {
  title: string;
  status: KanbanTask['status'];
  tasks: Array<{
    id: string;
    title: string;
    tag?: string;
    priority?: 'high' | 'medium' | 'low';
    description?: string;
  }>;
  onUpdateStatus?: (id: string, status: KanbanTask['status']) => void;
}

export function KanbanColumn({ title, status, tasks, onUpdateStatus }: KanbanColumnProps) {
  const { t } = useTranslation();
  return (
    <div className="min-w-[250px] bg-paper/30 border border-border rounded-lg flex flex-col">
      <div className="p-3 text-xs font-bold text-zinc-500 border-b border-border uppercase tracking-wide">
        {title} <span className="ml-1 opacity-50">({tasks.length})</span>
      </div>
      <div className="p-2 space-y-2 flex-1">
        {tasks.map((task) => (
          <MotionDiv layoutId={task.id} key={task.id}>
            <KanbanCard {...task} status={status} onUpdateStatus={onUpdateStatus} />
          </MotionDiv>
        ))}
        {tasks.length === 0 && (
          <div className="h-20 flex items-center justify-center text-zinc-700 text-xs italic">
            {t('kanban.noTasks')}
          </div>
        )}
      </div>
    </div>
  );
}
