"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { AgentDetailView } from "./AgentDetailView";

/* ─── Re-export types from AgentDetailView for backward compatibility ─── */
export type {
  AgentEntry,
  AgentOverride,
  AgentDefaults,
  ToolInfo,
  SkillInfo,
} from "./AgentDetailView";

import type { AgentEntry, AgentOverride } from "./AgentDetailView";

interface AddSkillPayload {
  mode: "reuse" | "install";
  skillId?: string;
  description?: string;
  installCommand?: string;
  installedSkillIdHint?: string;
}

interface AgentConfigCardProps {
  agent: AgentEntry;
  localOverride: AgentOverride;
  onChange: (agentId: string, patch: Partial<AgentOverride>) => void;
  onSave: (agentId: string) => Promise<boolean>;
  onAddSkill: (agentId: string, payload: AddSkillPayload) => Promise<{ success: boolean; error?: string; message?: string }>;
  onDelete?: (agentId: string) => Promise<boolean>;
}

function hasChanged(value: string | number | undefined, defaultValue: string | number): boolean {
  return value !== undefined && value !== defaultValue;
}

/* ─── Card (Grid Tile) ─── */
export function AgentConfigCard({ agent, localOverride, onChange, onSave, onAddSkill, onDelete }: AgentConfigCardProps) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);

  const uiMeta = getAgentUI(agent.id);
  const currentModel = localOverride.model ?? agent.defaults.model;

  const modelChanged = hasChanged(localOverride.model, agent.defaults.model);
  const loopsChanged = hasChanged(localOverride.maxLoops, agent.defaults.maxLoops);
  const promptChanged = hasChanged(localOverride.systemPrompt, agent.defaults.systemPrompt);
  const anyChanged = modelChanged || loopsChanged || promptChanged;

  const promptSnippet = (localOverride.systemPrompt ?? agent.defaults.systemPrompt).slice(0, 60);

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className={clsx(
          "group relative glass-1 rounded-xl overflow-hidden cursor-pointer",
          "hover:border-[var(--border-default)] transition-all duration-200",
          "flex flex-col"
        )}
      >
        {/* Colored bottom accent */}
        <div className={clsx("absolute bottom-0 left-0 right-0 h-[3px]", uiMeta?.color ?? "bg-[var(--bg-elevated)]")} />

        <div className="p-5 flex flex-col flex-1">
          {/* Top: Avatar + Name + Settings icon */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center text-xl",
                "bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
              )}>
                {uiMeta?.emoji ?? "\u{1F916}"}
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{agent.displayName}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{agent.role}</p>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
              className="p-1 rounded-md text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          {/* Model */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-mono text-[var(--text-secondary)]">{currentModel}</span>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant={agent.id}>{agent.runMode}</Badge>
            {agent.createdBy === 'subagent' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-500/30">
                {t('common.subAgent')}
              </span>
            )}
            {agent.projectId && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-200/10 text-zinc-300 border border-white/20">
                {agent.projectId.slice(0, 8)}
              </span>
            )}
            {anyChanged && <Badge variant="warning">{t('common.modified')}</Badge>}
            {agent.skills.length > 0 && (
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                {agent.skills.length} skills
              </span>
            )}
          </div>

          {/* Prompt snippet */}
          <p className="text-xs text-[var(--text-muted)] leading-relaxed line-clamp-2 flex-1">
            {promptSnippet}{promptSnippet.length >= 60 ? "\u2026" : ""}
          </p>

          {/* Bottom status dots */}
          <div className="flex items-center gap-1.5 mt-4">
            <span className={clsx("w-1.5 h-1.5 rounded-full", uiMeta?.color ?? "bg-[var(--bg-elevated)]")} />
            <span className={clsx("w-1.5 h-1.5 rounded-full opacity-60", uiMeta?.color ?? "bg-[var(--bg-elevated)]")} />
            <span className={clsx("w-1.5 h-1.5 rounded-full opacity-30", uiMeta?.color ?? "bg-[var(--bg-elevated)]")} />
          </div>
        </div>
      </div>

      {/* Detail View (three-column layout) */}
      {modalOpen && (
        <AgentDetailView
          agent={agent}
          localOverride={localOverride}
          onChange={onChange}
          onSave={onSave}
          onAddSkill={onAddSkill}
          onDelete={onDelete}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
