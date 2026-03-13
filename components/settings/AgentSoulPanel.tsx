"use client";

import { RotateCcw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { AgentEntry, AgentOverride } from "./AgentDetailView";

interface AgentSoulPanelProps {
  agent: AgentEntry;
  localOverride: AgentOverride;
  onChange: (agentId: string, patch: Partial<AgentOverride>) => void;
  onReset: (field: keyof AgentOverride) => void;
}

export function AgentSoulPanel({
  agent,
  localOverride,
  onChange,
  onReset,
}: AgentSoulPanelProps) {
  const { t } = useTranslation();

  const currentPrompt = localOverride.systemPrompt ?? agent.defaults.systemPrompt;
  const promptChanged = localOverride.systemPrompt !== undefined && localOverride.systemPrompt !== agent.defaults.systemPrompt;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">
      {/* System Prompt */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-mono text-zinc-500 uppercase">
            System Prompt {promptChanged && <span className="text-amber-400 ml-1">({t('common.modified')})</span>}
          </label>
          {promptChanged && (
            <button
              onClick={() => onReset("systemPrompt")}
              className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> {t('common.reset')}
            </button>
          )}
        </div>
        <textarea
          value={currentPrompt}
          onChange={(e) => onChange(agent.id, { systemPrompt: e.target.value })}
          className="flex-1 min-h-[400px] w-full bg-black/50 border border-zinc-700/50 rounded-lg p-3 text-xs font-mono text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors resize-y leading-relaxed"
        />
      </div>
    </div>
  );
}
