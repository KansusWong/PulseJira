"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import type { AgentLogEntry } from "@/store/slices/agentSlice";

/* ── Types ─────────────────────────────────────────────────── */

interface LogBubbleListProps {
  logs: AgentLogEntry[];
  maxHeight?: string; // Tailwind class, e.g. "max-h-80"
}

interface ParsedLog {
  agent: string;
  kind: "text" | "action" | "result" | "step" | "system" | "complete";
  content: string;
  toolName?: string;
  toolArgs?: string;
  toolStatus?: string;
  toolData?: string;
  timestamp: number;
}

interface AgentGroup {
  agent: string;
  items: ParsedLog[];
  timestamp: number;
}

/* ── Parse ─────────────────────────────────────────────────── */

function parseLogMessage(entry: AgentLogEntry): ParsedLog {
  const msg = entry.message;
  const ts = entry.timestamp;

  // [agent] Text: ...
  const textMatch = msg.match(/^\[(\w[\w-]*)\]\s*Text:\s*([\s\S]+)/);
  if (textMatch) {
    return { agent: textMatch[1], kind: "text", content: textMatch[2], timestamp: ts };
  }

  // [agent] Action: toolName(args...
  const actionMatch = msg.match(/^\[(\w[\w-]*)\]\s*Action:\s*(\w+)\(([\s\S]*)$/);
  if (actionMatch) {
    return {
      agent: actionMatch[1],
      kind: "action",
      content: msg,
      toolName: actionMatch[2],
      toolArgs: actionMatch[3],
      timestamp: ts,
    };
  }

  // [agent] Result: toolName | status | data...
  const resultMatch = msg.match(/^\[(\w[\w-]*)\]\s*Result:\s*(\w+)\s*\|\s*(\w+)\s*\|\s*([\s\S]*)$/);
  if (resultMatch) {
    return {
      agent: resultMatch[1],
      kind: "result",
      content: msg,
      toolName: resultMatch[2],
      toolStatus: resultMatch[3],
      toolData: resultMatch[4],
      timestamp: ts,
    };
  }

  // [agent] Step N: ...
  const stepMatch = msg.match(/^\[(\w[\w-]*)\]\s*Step\s+\d+:\s*([\s\S]+)/);
  if (stepMatch) {
    return { agent: stepMatch[1], kind: "step", content: stepMatch[2], timestamp: ts };
  }

  // [agent] Exit tool...
  const exitMatch = msg.match(/^\[(\w[\w-]*)\]\s*Exit tool/);
  if (exitMatch) {
    return { agent: exitMatch[1], kind: "complete", content: msg, timestamp: ts };
  }

  // [agent] ... completed
  const completedMatch = msg.match(/^\[(\w+)\]\s*(.+?)\s*completed/);
  if (completedMatch) {
    return { agent: "system", kind: "system", content: completedMatch[2] + " completed", timestamp: ts };
  }

  // [agent] Running ...
  const runningMatch = msg.match(/^\[(\w+)\]\s*Running\s+(.+)/);
  if (runningMatch) {
    return { agent: "system", kind: "system", content: "Running " + runningMatch[2], timestamp: ts };
  }

  // fallback
  const genericAgent = msg.match(/^\[(\w[\w-]*)\]/);
  return {
    agent: genericAgent ? genericAgent[1] : entry.agent,
    kind: "text",
    content: genericAgent ? msg.slice(genericAgent[0].length).trim() : msg,
    timestamp: ts,
  };
}

/* ── Group ─────────────────────────────────────────────────── */

function groupByAgent(parsed: ParsedLog[]): AgentGroup[] {
  const groups: AgentGroup[] = [];

  for (const item of parsed) {
    const last = groups[groups.length - 1];
    if (last && last.agent === item.agent) {
      last.items.push(item);
    } else {
      groups.push({ agent: item.agent, items: [item], timestamp: item.timestamp });
    }
  }

  return groups;
}

/* ── Sub-components ────────────────────────────────────────── */

function ActionItem({ item }: { item: ParsedLog }) {
  const [open, setOpen] = useState(false);
  const summary = item.toolArgs
    ? item.toolArgs.length > 80
      ? item.toolArgs.slice(0, 80) + "…"
      : item.toolArgs
    : "";

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-left w-full group"
      >
        <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
        <span className="text-xs font-mono text-blue-300">{item.toolName}()</span>
        {!open && summary && (
          <span className="text-[10px] text-zinc-600 truncate">{summary}</span>
        )}
        <ChevronDown
          className={clsx(
            "w-3 h-3 text-zinc-600 transition-transform ml-auto flex-shrink-0",
            open && "rotate-180",
          )}
        />
      </button>
      {open && item.toolArgs && (
        <pre className="mt-1 ml-4 text-[10px] text-zinc-500 bg-zinc-950/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
          {item.toolArgs}
        </pre>
      )}
    </div>
  );
}

function ResultItem({ item }: { item: ParsedLog }) {
  const [open, setOpen] = useState(false);
  const isOk = item.toolStatus === "success" || item.toolStatus === "ok";
  const summary = item.toolData
    ? item.toolData.length > 80
      ? item.toolData.slice(0, 80) + "…"
      : item.toolData
    : "";

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-left w-full group"
      >
        <span
          className={clsx(
            "w-2 h-2 rounded-full flex-shrink-0",
            isOk ? "bg-green-400" : "bg-red-400",
          )}
        />
        <span className="text-xs font-mono text-zinc-300">{item.toolName}</span>
        <span
          className={clsx(
            "text-[10px] px-1.5 py-0.5 rounded font-mono",
            isOk
              ? "bg-green-500/15 text-green-400"
              : "bg-red-500/15 text-red-400",
          )}
        >
          {item.toolStatus}
        </span>
        {!open && summary && (
          <span className="text-[10px] text-zinc-600 truncate">{summary}</span>
        )}
        <ChevronDown
          className={clsx(
            "w-3 h-3 text-zinc-600 transition-transform ml-auto flex-shrink-0",
            open && "rotate-180",
          )}
        />
      </button>
      {open && item.toolData && (
        <pre className="mt-1 ml-4 text-[10px] text-zinc-500 bg-zinc-950/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
          {item.toolData}
        </pre>
      )}
    </div>
  );
}

function LogItem({ item }: { item: ParsedLog }) {
  switch (item.kind) {
    case "text":
      return (
        <div className="py-1 prose prose-invert prose-sm max-w-none [&>*]:my-0.5 text-xs text-zinc-300 leading-relaxed break-words">
          <ReactMarkdown>{item.content}</ReactMarkdown>
        </div>
      );
    case "action":
      return <ActionItem item={item} />;
    case "result":
      return <ResultItem item={item} />;
    case "step":
      return (
        <p className="py-0.5 text-xs text-zinc-500 italic">{item.content}</p>
      );
    case "system":
      return (
        <p className="py-0.5 text-[11px] text-amber-400/80 text-center">
          {item.content}
        </p>
      );
    case "complete":
      return (
        <div className="flex items-center gap-1.5 py-0.5">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          <span className="text-[11px] text-green-400">Completed</span>
        </div>
      );
    default:
      return null;
  }
}

/* ── Main component ────────────────────────────────────────── */

export function LogBubbleList({ logs, maxHeight }: LogBubbleListProps) {
  const groups = useMemo(() => {
    const parsed = logs.map(parseLogMessage);
    return groupByAgent(parsed);
  }, [logs]);

  if (groups.length === 0) return null;

  return (
    <div className={clsx("space-y-3", maxHeight, maxHeight && "overflow-y-auto")}>
      {groups.map((group, gi) => {
        const isSystem = group.agent === "system";
        const agentUI = getAgentUI(group.agent);
        const badgeClass = agentUI?.badgeClass ?? "bg-zinc-500/20 text-zinc-400";
        const label = agentUI?.label ?? group.agent.slice(0, 3).toUpperCase();
        const displayName = group.agent;
        const time = new Date(group.timestamp).toLocaleTimeString();

        if (isSystem) {
          return (
            <div key={gi} className="max-w-[85%] w-fit mx-auto">
              <div className="rounded-2xl px-4 py-3 bg-amber-500/10 border border-amber-500/20">
                {group.items.map((item, ii) => (
                  <LogItem key={ii} item={item} />
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={gi} className="max-w-[85%] w-fit mr-auto">
            {/* Header: badge + name + time */}
            <div className="flex items-center gap-2 mb-1 px-1">
              <span
                className={clsx(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
                  badgeClass,
                )}
              >
                {label}
              </span>
              <span className="text-[11px] font-medium text-zinc-500">
                {displayName}
              </span>
              <span className="text-[10px] text-zinc-700">{time}</span>
            </div>

            {/* Bubble body */}
            <div className="rounded-2xl px-4 py-3 bg-zinc-900/60 border border-zinc-800/50">
              {group.items.map((item, ii) => (
                <LogItem key={ii} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
