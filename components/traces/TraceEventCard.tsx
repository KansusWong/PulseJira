"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { formatTraceTimestamp } from "./trace-utils";

interface TraceEventCardProps {
  event: {
    id?: number;
    seq: number;
    event_type: string;
    agent_name: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
  };
}

const PAYLOAD_TRUNCATE_LENGTH = 2000;

export function TraceEventCard({ event }: TraceEventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const agentUI = event.agent_name ? getAgentUI(event.agent_name) : undefined;
  const borderClass = agentUI?.stepCardClass?.split(" ")[0] || "border-l-zinc-600";

  const payloadStr = event.payload ? JSON.stringify(event.payload, null, 2) : null;
  const isTruncated = payloadStr && payloadStr.length > PAYLOAD_TRUNCATE_LENGTH;
  const displayPayload = showFull || !isTruncated
    ? payloadStr
    : payloadStr?.slice(0, PAYLOAD_TRUNCATE_LENGTH) + "\n...";

  return (
    <div className={clsx("border-l-2 pl-3 py-1.5", borderClass)}>
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-zinc-900/30 -ml-3 pl-3 pr-1 rounded"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Event type label */}
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 flex-shrink-0">
          {event.event_type}
        </span>

        {/* Agent badge */}
        {event.agent_name && agentUI && (
          <span className={clsx("text-[10px] font-mono px-1.5 py-0.5 rounded-full", agentUI.badgeClass)}>
            {agentUI.label}
          </span>
        )}
        {event.agent_name && !agentUI && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
            {event.agent_name}
          </span>
        )}

        {/* Sequence */}
        <span className="text-[10px] font-mono text-zinc-600">#{event.seq}</span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Timestamp */}
        <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0">
          {formatTraceTimestamp(event.created_at)}
        </span>

        {/* Expand icon */}
        {payloadStr && (
          <ChevronDown
            className={clsx(
              "w-3 h-3 text-zinc-600 transition-transform flex-shrink-0",
              expanded && "rotate-180"
            )}
          />
        )}
      </div>

      {/* Expandable payload */}
      {expanded && payloadStr && (
        <div className="mt-2 ml-5">
          <pre className="bg-zinc-900/50 rounded p-2 text-xs font-mono max-h-60 overflow-auto text-zinc-400 whitespace-pre-wrap break-words">
            {displayPayload}
          </pre>
          {isTruncated && !showFull && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowFull(true); }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-1 font-mono"
            >
              Show full
            </button>
          )}
        </div>
      )}
    </div>
  );
}
