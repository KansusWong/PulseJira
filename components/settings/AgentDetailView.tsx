"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Trash2, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import { AgentIdentityPanel } from "./AgentIdentityPanel";
import { AgentSoulPanel } from "./AgentSoulPanel";
import { AgentSkillPanel } from "./AgentSkillPanel";

/* ─── Shared types (exported for sub-panels) ─── */

export interface AgentDefaults {
  model: string;
  maxLoops: number;
  soul: string;
  systemPrompt: string;
}

export interface AgentOverride {
  model?: string;
  maxLoops?: number;
  soul?: string;
  systemPrompt?: string;
}

export interface ToolInfo {
  name: string;
  description: string;
}

export interface SkillInfo {
  name: string;
  description: string;
}

export interface AgentEntry {
  id: string;
  displayName: string;
  role: string;
  runMode: "react" | "single-shot";
  defaults: AgentDefaults;
  override: AgentOverride;
  tools: ToolInfo[];
  skills: SkillInfo[];
  isAIGenerated?: boolean;
  createdBy?: string;
  projectId?: string;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface AddSkillPayload {
  mode: "reuse" | "install";
  skillId?: string;
  description?: string;
  installCommand?: string;
  installedSkillIdHint?: string;
}

interface AgentDetailViewProps {
  agent: AgentEntry;
  localOverride: AgentOverride;
  onChange: (agentId: string, patch: Partial<AgentOverride>) => void;
  onSave: (agentId: string) => Promise<boolean>;
  onAddSkill: (agentId: string, payload: AddSkillPayload) => Promise<{ success: boolean; error?: string; message?: string }>;
  onDelete?: (agentId: string) => Promise<boolean>;
  onClose: () => void;
}

export function AgentDetailView({
  agent,
  localOverride,
  onChange,
  onSave,
  onAddSkill,
  onDelete,
  onClose,
}: AgentDetailViewProps) {
  const { t } = useTranslation();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [deleting, setDeleting] = useState(false);

  const uiMeta = getAgentUI(agent.id);

  const modelChanged = localOverride.model !== undefined && localOverride.model !== agent.defaults.model;
  const loopsChanged = localOverride.maxLoops !== undefined && localOverride.maxLoops !== agent.defaults.maxLoops;
  const promptChanged = localOverride.systemPrompt !== undefined && localOverride.systemPrompt !== agent.defaults.systemPrompt;
  const anyChanged = modelChanged || loopsChanged || promptChanged;

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    const ok = await onSave(agent.id);
    setSaveStatus(ok ? "saved" : "error");
    if (ok) setTimeout(() => setSaveStatus("idle"), 2500);
  }, [agent.id, onSave]);

  const resetField = useCallback((field: keyof AgentOverride) => {
    onChange(agent.id, { [field]: undefined });
    if (saveStatus === "saved") setSaveStatus("idle");
  }, [agent.id, onChange, saveStatus]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[1400px] h-[min(90vh,900px)] bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{uiMeta?.emoji ?? "\u{1F916}"}</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{agent.displayName}</h2>
                {agent.createdBy === 'subagent' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-500/30">
                    子Agent
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {agent.role}
                {agent.createdBy && <span className="ml-1 text-violet-500/60">by {agent.createdBy}</span>}
                {agent.projectId && <span className="ml-1 text-cyan-500/60">project: {agent.projectId.slice(0, 8)}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {agent.isAIGenerated && onDelete && (
              <button
                onClick={async () => {
                  setDeleting(true);
                  const ok = await onDelete(agent.id);
                  setDeleting(false);
                  if (ok) onClose();
                }}
                disabled={deleting}
                className="p-1.5 rounded-lg hover:bg-red-900/40 text-[var(--text-muted)] hover:text-red-400 transition-colors disabled:opacity-40"
                title={t('common.delete')}
              >
                {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Three-column body */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Left: Identity + Model */}
          <div className="w-full lg:w-[250px] shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] overflow-hidden">
            <AgentIdentityPanel
              agent={agent}
              localOverride={localOverride}
              onChange={onChange}
              onSave={handleSave}
              onReset={resetField}
              saveStatus={saveStatus}
              anyChanged={anyChanged}
            />
          </div>

          {/* Center: System Prompt */}
          <div className="flex-1 min-w-0 border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] overflow-hidden">
            <AgentSoulPanel
              agent={agent}
              localOverride={localOverride}
              onChange={onChange}
              onReset={resetField}
            />
          </div>

          {/* Right: Skills */}
          <div className="w-full lg:w-[320px] shrink-0 overflow-hidden">
            <AgentSkillPanel
              agentId={agent.id}
              skills={agent.skills}
              onAddSkill={onAddSkill}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
