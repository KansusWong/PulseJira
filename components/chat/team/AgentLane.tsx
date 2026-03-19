"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { useTranslation } from "@/lib/i18n";
import { usePulseStore } from "@/store/usePulseStore.new";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import type { StructuredAgentStep, AgentStatus, AgentMailMessage } from "@/lib/core/types";
import {
  buildDisplayItems,
  formatDuration,
  getItemDuration,
  Bullet,
} from "./step-utils";

const MAX_LANE_ITEMS = 4;

const statusColors: Record<string, string> = {
  active: "text-emerald-400",
  working: "text-cyan-400 animate-pulse",
  idle: "text-[var(--text-muted)]",
  completed: "text-blue-400",
  failed: "text-red-400",
};

interface MateChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Props {
  agentName: string;
  status: AgentStatus["status"];
  currentTask?: string;
  steps: StructuredAgentStep[];
  teamId: string | null;
  chatMessages?: MateChatMessage[];
  streamingContent?: string;
  onSendMessage?: (msg: string) => void;
  communications?: AgentMailMessage[];
}

export function AgentLane({
  agentName,
  status,
  currentTask,
  steps,
  teamId,
  chatMessages,
  streamingContent,
  onSendMessage,
  communications = [],
}: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const addMateChatMessage = usePulseStore((s) => s.addMateChatMessage);
  const ui = getAgentUI(agentName);
  const borderColor = ui?.borderColor || "border-[var(--text-muted)]";
  const badgeClass = ui?.badgeClass || "bg-[var(--bg-glass)] text-[var(--text-secondary)]";
  const label = ui?.label || agentName;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll chat area
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages?.length, streamingContent, communications.length]);

  const allItems = buildDisplayItems(steps);
  const filtered = allItems.filter(
    (item, idx) => item.type !== "thinking" || idx === allItems.length - 1,
  );

  const hiddenCount = Math.max(0, filtered.length - MAX_LANE_ITEMS);
  const visibleItems = hiddenCount > 0 ? filtered.slice(-MAX_LANE_ITEMS) : filtered;
  const lastItem = filtered[filtered.length - 1];

  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isIdle = status === "idle";

  const hasChatContent = (chatMessages && chatMessages.length > 0) || streamingContent || communications.length > 0;

  // Build a unified timeline of chat messages and communications, sorted by timestamp
  const chatTimeline = useMemo(() => {
    const items: Array<
      | { kind: 'chat'; msg: MateChatMessage; ts: number }
      | { kind: 'comm'; msg: AgentMailMessage; ts: number }
    > = [];
    for (const msg of chatMessages || []) {
      items.push({ kind: 'chat', msg, ts: msg.timestamp });
    }
    for (const comm of communications) {
      items.push({ kind: 'comm', msg: comm, ts: new Date(comm.created_at).getTime() });
    }
    items.sort((a, b) => a.ts - b.ts);
    return items;
  }, [chatMessages, communications]);

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text || !onSendMessage) return;
    addMateChatMessage(agentName, 'user', text);
    onSendMessage(text);
    setChatInput("");
  };

  return (
    <div
      className={`flex flex-col min-h-0 border-l-2 ${borderColor} rounded-lg bg-[var(--bg-surface)]/50 border border-[var(--border-subtle)] overflow-hidden ${
        isCompleted ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeClass}`}
          >
            {label}
          </span>
          <span className="text-xs text-[var(--text-secondary)] truncate max-w-[120px]">
            {agentName}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          {isFailed && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
          {!isCompleted && !isFailed && (
            <span
              className={`w-2 h-2 rounded-full ${
                status === "working" || status === "active"
                  ? "bg-cyan-400 animate-pulse"
                  : "bg-[var(--text-muted)]"
              }`}
            />
          )}
          <span
            className={`text-[10px] capitalize ${statusColors[status] || "text-[var(--text-muted)]"}`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Steps body */}
      <div className="flex-shrink-0 max-h-[140px] overflow-y-auto px-3 py-2 space-y-1.5">
        {hiddenCount > 0 && (
          <div className="text-[10px] text-[var(--text-muted)] mb-1">
            {t("team.collaboration.earlierSteps").replace(
              "{count}",
              String(hiddenCount),
            )}
          </div>
        )}

        {isIdle && visibleItems.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-pulse" />
            {t("team.collaboration.waitingForTask")}
          </div>
        )}

        {isFailed && visibleItems.length === 0 && (
          <div className="text-xs text-red-400/70 py-2">
            {t("team.collaboration.agentFailed")}
          </div>
        )}

        {visibleItems.map((item) => {
          const isLast = item === lastItem;
          const nextInFiltered = filtered[filtered.indexOf(item) + 1];
          const durationMs = getItemDuration(item, nextInFiltered, isLast, now);

          if (item.type === "thinking") {
            return (
              <div
                key={item.step.id}
                className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"
              >
                <Bullet color="bg-blue-400" pulse />
                <span className="flex-1 truncate">{item.step.message || "..."}</span>
                {durationMs !== null && (
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)] tabular-nums">
                    {formatDuration(durationMs)}
                  </span>
                )}
                <Loader2 className="w-3 h-3 shrink-0 mt-0.5 text-[var(--text-muted)] animate-spin" />
              </div>
            );
          }

          if (item.type === "text") {
            return (
              <div
                key={item.step.id}
                className="flex items-start gap-2 text-xs text-[var(--text-primary)]"
              >
                <Bullet color="bg-[var(--text-muted)]" />
                <span className="flex-1 min-w-0 line-clamp-2">
                  {item.step.message}
                </span>
                {isLast && (
                  <Loader2 className="w-3 h-3 shrink-0 mt-0.5 text-[var(--text-muted)] animate-spin" />
                )}
              </div>
            );
          }

          if (item.type === "tool") {
            const hasResult = !!item.resultStep;
            const success = item.resultStep?.success !== false;
            const bulletColor = !hasResult
              ? "bg-blue-400"
              : success
                ? "bg-emerald-500"
                : "bg-red-500";

            const toolLabel =
              item.callStep.toolLabel || item.callStep.toolName || "tool";
            const argSummary = item.callStep.argSummary;
            const displayName = argSummary
              ? `${toolLabel}(${argSummary})`
              : toolLabel;

            return (
              <div key={item.callStep.id} className="space-y-0.5">
                <div className="flex items-start gap-2 text-xs text-[var(--text-primary)]">
                  <Bullet color={bulletColor} pulse={!hasResult && isLast} />
                  <span className="flex-1 min-w-0 font-mono text-[11px] truncate">
                    {displayName}
                  </span>
                  {durationMs !== null && (
                    <span className="shrink-0 text-[10px] text-[var(--text-muted)] tabular-nums">
                      {formatDuration(durationMs)}
                    </span>
                  )}
                  {isLast && !hasResult && (
                    <Loader2 className="w-3 h-3 shrink-0 mt-0.5 text-[var(--text-muted)] animate-spin" />
                  )}
                </div>
                {hasResult && (
                  <div
                    className={`ml-4 text-[10px] ${
                      success ? "text-[var(--text-muted)]" : "text-red-400/70"
                    } break-words`}
                  >
                    └ {success ? item.resultStep!.resultPreview || "完成" : `失败: ${item.resultStep!.resultPreview || "?"}`}
                  </div>
                )}
              </div>
            );
          }

          // completion
          return (
            <div
              key={item.step.id}
              className="flex items-start gap-2 text-xs text-emerald-400/80"
            >
              <Bullet color="bg-emerald-500" />
              <span>{item.step.message}</span>
            </div>
          );
        })}
      </div>

      {/* Mini-chat area */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-[var(--border-subtle)]">
        {/* Chat messages + inter-agent comms + streaming content */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {chatTimeline.map((item, i) => {
            if (item.kind === 'chat') {
              const msg = item.msg;
              if (msg.role === 'user') {
                return (
                  <div
                    key={`chat-${i}`}
                    className="text-[11px] text-blue-300 bg-blue-500/10 rounded px-2 py-1"
                  >
                    <span className="text-[10px] text-blue-400/70 mr-1">You:</span>
                    <span className="break-words whitespace-pre-wrap">
                      {msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content}
                    </span>
                  </div>
                );
              }
              // Assistant message — render with MarkdownRenderer
              return (
                <div key={`chat-${i}`} className="lane-prose">
                  <MarkdownRenderer content={msg.content} />
                </div>
              );
            }
            // Inter-agent communication
            const comm = item.msg;
            const isSent = comm.from_agent === agentName;
            const otherAgent = isSent ? comm.to_agent : comm.from_agent;
            const otherUI = getAgentUI(otherAgent);
            const otherColor = otherUI?.badgeClass
              ? otherUI.badgeClass.split(" ").find((c: string) => c.startsWith("text-")) || "text-[var(--text-secondary)]"
              : "text-zinc-400";
            const payload =
              typeof comm.payload === "string"
                ? comm.payload
                : comm.payload?.message ||
                  comm.payload?.instruction ||
                  JSON.stringify(comm.payload).slice(0, 120);
            return (
              <div
                key={`comm-${comm.id}`}
                className={`text-[11px] rounded px-2 py-1 ${
                  isSent
                    ? 'bg-amber-500/5 border border-amber-500/10'
                    : 'bg-violet-500/5 border border-violet-500/10'
                }`}
              >
                <span className="text-[10px] text-[var(--text-muted)] mr-1">
                  {isSent ? '→' : '←'}
                </span>
                <span className={`text-[10px] font-medium ${otherColor} mr-1`}>
                  {otherAgent}
                </span>
                <span className="text-[var(--text-secondary)] break-words whitespace-pre-wrap">
                  {payload.length > 300 ? payload.slice(0, 300) + '...' : payload}
                </span>
              </div>
            );
          })}

          {/* Streaming content — MarkdownRenderer with streaming flag */}
          {streamingContent && (
            <div className="relative lane-prose">
              <MarkdownRenderer content={streamingContent} isStreaming />
              <span className="inline-block w-0.5 h-4 bg-[var(--text-muted)] animate-pulse ml-0.5 align-text-bottom" />
            </div>
          )}

          {!hasChatContent && (
            <div className="text-[10px] text-[var(--text-muted)] py-1">
              {currentTask || t("team.collaboration.waitingForTask")}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Chat input */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-[var(--border-subtle)]">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendChat();
              }
            }}
            placeholder={t("team.collaboration.sendInstruction")}
            className="flex-1 bg-[var(--bg-surface)]/80 border border-[var(--border-subtle)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
          />
          <button
            onClick={handleSendChat}
            disabled={!chatInput.trim()}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
