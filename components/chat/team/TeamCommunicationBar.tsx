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
    <div className="border-t border-[var(--border-subtle)]">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
      >
        <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span className="text-[11px] text-[var(--text-secondary)]">
          {t("team.collaboration.comms").replace(
            "{count}",
            String(communications.length),
          )}
        </span>
        {open ? (
          <ChevronUp className="w-3 h-3 text-[var(--text-muted)] ml-auto" />
        ) : (
          <ChevronDown className="w-3 h-3 text-[var(--text-muted)] ml-auto" />
        )}
      </button>

      {/* Messages */}
      {open && (
        <div className="max-h-[160px] overflow-y-auto px-4 pb-2 space-y-1.5">
          {visibleMessages.length === 0 ? (
            <p className="text-[10px] text-[var(--text-muted)] py-1">
              {t("team.collaboration.noComms")}
            </p>
          ) : (
            visibleMessages.map((msg) => {
              const fromUI = getAgentUI(msg.from_agent);
              const toUI = getAgentUI(msg.to_agent);
              const fromColor = fromUI?.badgeClass
                ? fromUI.badgeClass.split(" ").find((c) => c.startsWith("text-")) ||
                  "text-[var(--text-secondary)]"
                : "text-[var(--text-secondary)]";
              const toColor = toUI?.badgeClass
                ? toUI.badgeClass.split(" ").find((c) => c.startsWith("text-")) ||
                  "text-[var(--text-secondary)]"
                : "text-[var(--text-secondary)]";

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
                  <span className="text-[var(--text-muted)] shrink-0">&rarr;</span>
                  <span className={`font-medium shrink-0 ${toColor}`}>
                    {msg.to_agent}
                  </span>
                  <span className="text-[var(--text-muted)] truncate">{payload}</span>
                  <span className="text-[9px] text-[var(--text-disabled)] shrink-0 ml-auto tabular-nums">
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
