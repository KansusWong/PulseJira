"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { useTranslation } from "@/lib/i18n";
import type { AgentMailMessage } from "@/lib/core/types";

const MAX_MESSAGES = 50;

interface Props {
  communications: AgentMailMessage[];
}

export function TeamCommunicationBar({ communications }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const prevCountRef = useRef(0);

  // Auto-expand on first message arrival
  useEffect(() => {
    if (prevCountRef.current === 0 && communications.length > 0) {
      setOpen(true);
    }
    prevCountRef.current = communications.length;
  }, [communications.length]);

  const visibleMessages = communications.slice(-MAX_MESSAGES);

  return (
    <div className="border-t border-zinc-800/50">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-zinc-800/20 transition-colors"
      >
        <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[11px] text-zinc-400">
          {t("team.collaboration.comms").replace(
            "{count}",
            String(communications.length),
          )}
        </span>
        {open ? (
          <ChevronUp className="w-3 h-3 text-zinc-600 ml-auto" />
        ) : (
          <ChevronDown className="w-3 h-3 text-zinc-600 ml-auto" />
        )}
      </button>

      {/* Messages */}
      {open && (
        <div className="max-h-[160px] overflow-y-auto px-4 pb-2 space-y-1.5">
          {visibleMessages.length === 0 ? (
            <p className="text-[10px] text-zinc-600 py-1">
              {t("team.collaboration.noComms")}
            </p>
          ) : (
            visibleMessages.map((msg) => {
              const fromUI = getAgentUI(msg.from_agent);
              const toUI = getAgentUI(msg.to_agent);
              const fromColor = fromUI?.badgeClass
                ? fromUI.badgeClass.split(" ").find((c) => c.startsWith("text-")) ||
                  "text-zinc-400"
                : "text-zinc-400";
              const toColor = toUI?.badgeClass
                ? toUI.badgeClass.split(" ").find((c) => c.startsWith("text-")) ||
                  "text-zinc-400"
                : "text-zinc-400";

              const payload =
                typeof msg.payload === "string"
                  ? msg.payload
                  : msg.payload?.message ||
                    msg.payload?.instruction ||
                    JSON.stringify(msg.payload).slice(0, 120);

              return (
                <div key={msg.id} className="flex items-start gap-1.5 text-[11px]">
                  <span className={`font-medium shrink-0 ${fromColor}`}>
                    {msg.from_agent}
                  </span>
                  <span className="text-zinc-600 shrink-0">&rarr;</span>
                  <span className={`font-medium shrink-0 ${toColor}`}>
                    {msg.to_agent}
                  </span>
                  <span className="text-zinc-500 truncate">{payload}</span>
                  <span className="text-[9px] text-zinc-700 shrink-0 ml-auto tabular-nums">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
