"use client";

import { useEffect, useRef } from "react";
import { LogBubbleList } from "./LogBubbleList";
import type { AgentLogEntry } from "@/store/slices/agentSlice";

interface AgentActivityFeedProps {
  logs: AgentLogEntry[];
}

export function AgentActivityFeed({ logs }: AgentActivityFeedProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-zinc-600 italic">
        Agent activity will appear here...
      </div>
    );
  }

  return (
    <div className="py-2">
      <LogBubbleList logs={logs} />
      <div ref={endRef} />
    </div>
  );
}
