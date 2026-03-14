"use client";

import { RotateCcw, Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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

  const currentModel = localOverride.model ?? agent.defaults.model;
  const currentMaxLoops = localOverride.maxLoops ?? agent.defaults.maxLoops;

  const modelChanged = localOverride.model !== undefined && localOverride.model !== agent.defaults.model;
  const loopsChanged = localOverride.maxLoops !== undefined && localOverride.maxLoops !== agent.defaults.maxLoops;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-5 p-4">
        {/* Avatar + Name */}
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-12 h-12 rounded-full flex items-center justify-center text-2xl",
            "bg-zinc-800/80 border border-zinc-700/50",
          )}>
            {uiMeta?.emoji ?? "\u{1F916}"}
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-100">{agent.displayName}</h3>
            <p className="text-xs text-zinc-500">{agent.role}</p>
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
            <label className="text-xs font-mono text-zinc-500 uppercase">
              Model {modelChanged && <span className="text-amber-400 ml-1">({t('common.modified')})</span>}
            </label>
            {modelChanged && (
              <button onClick={() => onReset("model")} className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> {t('common.reset')}
              </button>
            )}
          </div>
          <input
            value={currentModel}
            onChange={(e) => onChange(agent.id, { model: e.target.value })}
            className="w-full bg-black/50 border border-zinc-700/50 rounded-lg p-2.5 text-sm font-mono text-zinc-200 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder={agent.defaults.model}
          />
        </div>

        {/* maxLoops */}
        {agent.runMode === "react" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-zinc-500 uppercase">
                Max Loops {loopsChanged && <span className="text-amber-400 ml-1">({t('common.modified')})</span>}
              </label>
              {loopsChanged && (
                <button onClick={() => onReset("maxLoops")} className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1">
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
        <div className="shrink-0 px-4 py-3 border-t border-zinc-800">
          <button
            onClick={onSave}
            disabled={saveStatus === "saving"}
            className="flex items-center gap-2 px-4 py-2 w-full justify-center bg-white text-black text-xs font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-all"
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
