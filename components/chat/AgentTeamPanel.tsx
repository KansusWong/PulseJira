"use client";

import { usePulseStore } from "@/store/usePulseStore.new";
import {
  X,
  Users,
  Circle,
  MessageSquare,
  Pause,
  Play,
  Send,
} from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from '@/lib/i18n';

const statusColors: Record<string, string> = {
  active: "text-emerald-400",
  working: "text-cyan-400 animate-pulse",
  idle: "text-[var(--text-muted)]",
  completed: "text-blue-400",
  failed: "text-red-400",
};

export function AgentTeamPanel() {
  const { t } = useTranslation();
  const teamPanel = usePulseStore((s) => s.teamPanel);
  const hideTeamPanel = usePulseStore((s) => s.hideTeamPanel);
  const [interventionText, setInterventionText] = useState("");

  const handleIntervene = async () => {
    if (!interventionText.trim() || !teamPanel.teamId) return;

    try {
      await fetch(`/api/teams/${teamPanel.teamId}/intervene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_instruction",
          instruction: interventionText.trim(),
        }),
      });
      setInterventionText("");
    } catch {
      // Silent fail
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--text-secondary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('team.title')}</h3>
        </div>
        <button
          onClick={hideTeamPanel}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Agent List */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
          {t('team.members')}
        </div>
        <div className="space-y-2">
          {teamPanel.agents.length > 0 ? (
            teamPanel.agents.map((agent) => (
              <div
                key={agent.name}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
              >
                <div className="flex items-center gap-2">
                  <Circle
                    className={clsx("w-2.5 h-2.5 fill-current", statusColors[agent.status])}
                  />
                  <span className="text-sm text-[var(--text-primary)]">{agent.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[var(--text-muted)] capitalize">
                    {agent.status}
                  </span>
                  {agent.status === "working" && (
                    <button className="p-1 text-[var(--text-muted)] hover:text-amber-400 transition-colors">
                      <Pause className="w-3 h-3" />
                    </button>
                  )}
                  {agent.status === "idle" && (
                    <button className="p-1 text-[var(--text-muted)] hover:text-emerald-400 transition-colors">
                      <Play className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-[var(--text-muted)]">{t('team.forming')}</p>
          )}
        </div>
      </div>

      {/* Communication Log */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
          {t('team.communications')}
        </div>
        <div className="space-y-2">
          {teamPanel.communications.length > 0 ? (
            teamPanel.communications.map((msg) => (
              <div
                key={msg.id}
                className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {msg.from_agent} → {msg.to_agent}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {typeof msg.payload === "string"
                    ? msg.payload
                    : msg.payload?.message || msg.payload?.instruction || JSON.stringify(msg.payload).slice(0, 100)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-[var(--text-muted)]">{t('team.noCommunications')}</p>
          )}
        </div>
      </div>

      {/* Intervention Input */}
      <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={interventionText}
            onChange={(e) => setInterventionText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleIntervene();
            }}
            placeholder={t('team.sendInstruction')}
            className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
          />
          <button
            onClick={handleIntervene}
            disabled={!interventionText.trim()}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
