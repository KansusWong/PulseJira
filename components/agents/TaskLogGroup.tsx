"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import { ChevronDown, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LogBubbleList } from "./LogBubbleList";
import type { AgentLogEntry } from "@/store/slices/agentSlice";

interface TaskLogGroupProps {
  title: string;
  status: "todo" | "in-progress" | "done";
  logs: AgentLogEntry[];
  defaultOpen?: boolean;
  index?: number;
  total?: number;
}

function getStatusConfig(t: (key: string) => string) {
  return {
    todo: { icon: AlertCircle, label: t('taskLog.todo'), dotClass: "bg-zinc-500", textClass: "text-zinc-500" },
    "in-progress": { icon: Loader2, label: t('taskLog.inProgress'), dotClass: "bg-amber-500", textClass: "text-amber-400" },
    done: { icon: CheckCircle2, label: t('taskLog.done'), dotClass: "bg-green-500", textClass: "text-green-400" },
  };
}

function parseLatestAction(logs: AgentLogEntry[]): { agent: string; action: string } | null {
  if (logs.length === 0) return null;
  const last = logs[logs.length - 1];
  const msg = last.message;

  const actionMatch = msg.match(/\[(\w+)\]\s*Action:\s*(\w+)\((.*)$/);
  if (actionMatch) {
    return { agent: actionMatch[1], action: `${actionMatch[2]}()` };
  }

  const stepMatch = msg.match(/\[(\w+)\]\s*Step\s+\d+:\s*(.+)/);
  if (stepMatch) {
    return { agent: stepMatch[1], action: stepMatch[2] };
  }

  const agentMatch = msg.match(/\[(\w+)\]\s*(.+)/);
  if (agentMatch) {
    return { agent: agentMatch[1], action: agentMatch[2].slice(0, 60) };
  }

  return { agent: last.agent, action: msg.slice(0, 60) };
}

export function TaskLogGroup({ title, status, logs, defaultOpen, index, total }: TaskLogGroupProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen ?? status === "in-progress");
  const cfg = getStatusConfig(t)[status];
  const StatusIcon = cfg.icon;
  const isRunning = status === "in-progress";

  const latestAction = useMemo(() => isRunning ? parseLatestAction(logs) : null, [isRunning, logs]);

  return (
    <div className={clsx(
      "border rounded-lg overflow-hidden transition-colors",
      isRunning ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-paper/30",
    )}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex flex-col px-4 py-3 text-left hover:bg-zinc-900/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 w-full">
          <StatusIcon
            className={clsx(
              "w-4 h-4 flex-shrink-0",
              cfg.textClass,
              isRunning && "animate-spin",
            )}
          />

          <div className="flex-1 min-w-0">
            <span className="text-sm text-zinc-200 font-medium truncate block">
              {index !== undefined && total !== undefined && (
                <span className="text-zinc-600 font-mono text-xs mr-2">{index}/{total}</span>
              )}
              {title}
            </span>
          </div>

          {logs.length > 0 && (
            <span className="text-[10px] text-zinc-600 font-mono flex-shrink-0">
              {logs.length} steps
            </span>
          )}

          <span className={clsx("text-[10px] font-mono px-1.5 py-0.5 rounded", cfg.textClass, `${cfg.dotClass}/20`)}>
            {cfg.label}
          </span>

          <ChevronDown
            className={clsx(
              "w-3.5 h-3.5 text-zinc-600 transition-transform flex-shrink-0",
              open && "rotate-180",
            )}
          />
        </div>

        {/* Live status line — always visible when task is running */}
        {isRunning && (
          <div className="flex items-center gap-1.5 mt-1.5 ml-6.5 pl-0.5">
            <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-500 flex-shrink-0" />
            {latestAction ? (
              <span className="text-[10px] text-zinc-500 truncate">
                <span className="text-amber-400/70 font-mono">{latestAction.agent}</span>
                <span className="text-zinc-700 mx-1">→</span>
                <span className="text-zinc-400">{latestAction.action}</span>
              </span>
            ) : (
              <span className="text-[10px] text-amber-400/60">{t('taskLog.agentPreparing')}</span>
            )}
          </div>
        )}
      </button>

      {open && logs.length > 0 && (
        <div className="border-t border-border px-4 py-2 max-h-80 overflow-y-auto">
          <LogBubbleList logs={logs} />
        </div>
      )}

      {open && logs.length === 0 && !isRunning && (
        <div className="border-t border-border px-4 py-4 text-center text-xs text-zinc-700 italic">
          {t('taskLog.noLogs')}
        </div>
      )}
    </div>
  );
}
