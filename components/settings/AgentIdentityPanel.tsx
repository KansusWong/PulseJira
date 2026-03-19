"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Save, Loader2, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Badge } from "@/components/ui/Badge";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import type { AgentEntry, AgentOverride, SaveStatus } from "./AgentDetailView";

interface AgentIdentityPanelProps {
  agent: AgentEntry;
  localOverride: AgentOverride;
  onChange: (agentId: string, patch: Partial<AgentOverride>) => void;
  onSave: () => Promise<void>;
  onReset: (field: keyof AgentOverride) => void;
  saveStatus: SaveStatus;
  anyChanged: boolean;
}

export function AgentIdentityPanel({
  agent,
  localOverride,
  onChange,
  onSave,
  onReset,
  saveStatus,
  anyChanged,
}: AgentIdentityPanelProps) {
  const { t } = useTranslation();
  const uiMeta = getAgentUI(agent.id);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const currentModel = localOverride.model ?? agent.defaults.model;
  const currentMaxLoops = localOverride.maxLoops ?? agent.defaults.maxLoops;

  const modelChanged = localOverride.model !== undefined && localOverride.model !== agent.defaults.model;
  const loopsChanged = localOverride.maxLoops !== undefined && localOverride.maxLoops !== agent.defaults.maxLoops;

  // Fetch available models from LLM pool
  useEffect(() => {
    fetch("/api/settings/llm-pool")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.accounts) {
          const models = new Set<string>();
          models.add("inherit");
          for (const acct of json.data.accounts) {
            if (acct.defaultModel) models.add(acct.defaultModel);
            if (acct.modelMapping) {
              for (const v of Object.values(acct.modelMapping)) {
                if (v) models.add(v as string);
              }
            }
          }
          setAvailableModels(Array.from(models));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-5 p-4">
        {/* Avatar + Name */}
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-12 h-12 rounded-full flex items-center justify-center text-2xl",
            "bg-[var(--bg-elevated)] border border-[var(--border-subtle)]",
          )}>
            {uiMeta?.emoji ?? "\u{1F916}"}
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">{agent.displayName}</h3>
            <p className="text-xs text-[var(--text-muted)]">{agent.role}</p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={agent.id}>{agent.runMode}</Badge>
          {agent.isAIGenerated && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-500/30">
              AI
            </span>
          )}
        </div>

        {/* Model */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-[var(--text-muted)] font-medium uppercase">
              Model {modelChanged && <span className="text-zinc-300 ml-1">({t('common.modified')})</span>}
            </label>
            {modelChanged && agent.id !== 'rebuild' && (
              <button onClick={() => onReset("model")} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> {t('common.reset')}
              </button>
            )}
          </div>
          {agent.id === 'rebuild' ? (
            <div className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-sm font-mono text-[var(--text-secondary)] flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto
              <span className="text-[10px] text-[var(--text-muted)] ml-auto">{t('common.modelAutoHint')}</span>
            </div>
          ) : (
            <div className="relative">
              <select
                value={currentModel}
                onChange={(e) => onChange(agent.id, { model: e.target.value })}
                className="w-full appearance-none bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-2.5 pr-8 text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-accent)] transition-colors cursor-pointer"
              >
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))
                ) : (
                  <option value={currentModel}>{currentModel}</option>
                )}
                {currentModel && !availableModels.includes(currentModel) && (
                  <option value={currentModel}>{currentModel}</option>
                )}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
            </div>
          )}
        </div>

        {/* maxLoops */}
        {agent.runMode === "react" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-[var(--text-muted)] font-medium uppercase">
                Max Loops {loopsChanged && <span className="text-zinc-300 ml-1">({t('common.modified')})</span>}
              </label>
              {loopsChanged && (
                <button onClick={() => onReset("maxLoops")} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> {t('common.reset')}
                </button>
              )}
            </div>
            <NumberStepper
              value={currentMaxLoops}
              min={1}
              max={50}
              onChange={(maxLoops) => onChange(agent.id, { maxLoops })}
              className="w-32"
              valueClassName="flex-1"
            />
          </div>
        )}
      </div>

      {/* Bottom save area */}
      {anyChanged && (
        <div className="shrink-0 px-4 py-3 border-t border-[var(--border-subtle)]">
          <button
            onClick={onSave}
            disabled={saveStatus === "saving"}
            className="flex items-center gap-2 px-4 py-2 w-full justify-center bg-white text-black text-xs font-bold rounded-lg hover:bg-white/80 disabled:opacity-50 transition-all"
          >
            {saveStatus === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saveStatus === "saved" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
            {saveStatus === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
            {saveStatus === "idle" && <Save className="w-3.5 h-3.5" />}
            {saveStatus === "saving" ? t('common.saving') : saveStatus === "saved" ? t('common.saved') : saveStatus === "error" ? t('common.saveFailed') : t('common.save')}
          </button>
        </div>
      )}
    </div>
  );
}
