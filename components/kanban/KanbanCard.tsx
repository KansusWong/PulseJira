"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import clsx from "clsx";
import type { KanbanTask } from "@/store/slices/kanbanSlice";

interface KanbanCardProps {
  id: string;
  title: string;
  status: KanbanTask['status'];
  tag?: string;
  priority?: 'high' | 'medium' | 'low';
  description?: string;
  onUpdateStatus?: (id: string, status: KanbanTask['status']) => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

const statusFlow: KanbanTask['status'][] = ['todo', 'in-progress', 'done'];
const statusLabels: Record<string, string> = { todo: 'To Do', 'in-progress': 'In Progress', done: 'Done' };

export function KanbanCard({ id, title, status, tag, priority, description, onUpdateStatus }: KanbanCardProps) {
  const idx = statusFlow.indexOf(status);
  const canPrev = idx > 0;
  const canNext = idx < statusFlow.length - 1;

  return (
    <div className="group bg-black border border-border p-3 rounded text-sm hover:border-zinc-600 transition-colors">
      <p className="text-zinc-200 text-xs font-medium">{title}</p>
      {description && (
        <p className="text-[10px] text-zinc-600 mt-1 line-clamp-2">{description}</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {priority && (
            <div className={clsx("w-2 h-2 rounded-full", priorityColors[priority] || priorityColors.medium)} />
          )}
          {tag && <Badge variant="default" className="text-[9px]">{tag}</Badge>}
        </div>
        {onUpdateStatus && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canPrev && (
              <button
                onClick={() => onUpdateStatus(id, statusFlow[idx - 1])}
                className="p-0.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-200 transition-colors"
                title={`Move to ${statusLabels[statusFlow[idx - 1]]}`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {canNext && (
              <button
                onClick={() => onUpdateStatus(id, statusFlow[idx + 1])}
                className="p-0.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-200 transition-colors"
                title={`Move to ${statusLabels[statusFlow[idx + 1]]}`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
