"use client";

import { useState } from "react";
import { Send, ChevronDown } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { AgentStatus } from "@/lib/core/types";

interface Props {
  teamId: string | null;
  agents: AgentStatus[];
}

export function TeamInterventionInput({ teamId, agents }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || !teamId) return;

    try {
      await fetch(`/api/teams/${teamId}/intervene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_instruction",
          instruction: text.trim(),
          target: target === "all" ? undefined : target,
        }),
      });
      setText("");
    } catch {
      // Silent fail
    }
  };

  const targetLabel =
    target === "all"
      ? t("team.collaboration.allAgents")
      : target;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[var(--border-subtle)]">
      {/* Target selector */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-glass)] border border-[var(--border-default)] rounded-lg hover:border-[var(--border-focus)] transition-colors"
        >
          @{targetLabel}
          <ChevronDown className="w-3 h-3" />
        </button>

        {dropdownOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-40 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg shadow-xl z-10 py-1">
            <button
              onClick={() => {
                setTarget("all");
                setDropdownOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              {t("team.collaboration.allAgents")}
            </button>
            {agents.map((a) => (
              <button
                key={a.name}
                onClick={() => {
                  setTarget(a.name);
                  setDropdownOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                {a.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend();
        }}
        placeholder={t("team.collaboration.sendInstruction")}
        className="flex-1 bg-[var(--bg-surface)]/80 border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
      />

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={!text.trim()}
        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
