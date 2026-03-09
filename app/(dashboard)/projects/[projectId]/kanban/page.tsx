"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { usePulseStore } from "@/store/usePulseStore.new";

export default function KanbanPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);

  const tasks = usePulseStore((s) => s.tasks);
  const updateTaskStatus = usePulseStore((s) => s.updateTaskStatus);

  if (!hasMounted) return null;

  const projectTasks = tasks.filter((t) => !t.projectId || t.projectId === projectId);

  return (
    <div className="h-full flex flex-col">
      <div className="h-12 border-b border-border flex items-center px-4 bg-paper/50">
        <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase">
          Full Kanban Board
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <KanbanBoard tasks={projectTasks} onUpdateStatus={updateTaskStatus} />
      </div>
    </div>
  );
}
