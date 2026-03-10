"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  ChevronDown,
  Wrench,
  Zap,
  RotateCcw,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Settings2,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { getAgentUI } from "@/lib/config/agent-ui-meta";

interface ToolInfo {
  name: string;
  description: string;
}

interface SkillInfo {
  name: string;
  description: string;
}

interface AgentDefaults {
  model: string;
  maxLoops: number;
  soul: string;
  systemPrompt: string;
}

interface AgentOverride {
  model?: string;
  maxLoops?: number;
  soul?: string;
  systemPrompt?: string;
}

interface AddSkillPayload {
  mode: "reuse" | "install";
  skillId?: string;
  description?: string;
  installCommand?: string;
  installedSkillIdHint?: string;
}

interface AvailableSkillOption {
  id: string;
  description: string;
  source: "project" | "codex" | "registry";
  bound: boolean;
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

type SaveStatus = "idle" | "saving" | "saved" | "error";
type AddSkillStatus = "idle" | "adding" | "success" | "error";

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

/* ─── Edit Modal ─── */
function AgentEditModal({
  agent,
  localOverride,
  onChange,
  onSave,
  onAddSkill,
  onDelete,
  onClose,
}: AgentConfigCardProps & { onClose: () => void }) {
  const { t } = useTranslation();
  const [soulOpen, setSoulOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [reuseSkillId, setReuseSkillId] = useState("");
  const [reuseSkillDescription, setReuseSkillDescription] = useState("");
  const [availableSkills, setAvailableSkills] = useState<AvailableSkillOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [selectedCatalogSkillId, setSelectedCatalogSkillId] = useState("");
  const [showOnlyUnbound, setShowOnlyUnbound] = useState(false);
  const [installCommand, setInstallCommand] = useState("npx skills add ");
  const [installedSkillIdHint, setInstalledSkillIdHint] = useState("");
  const [addSkillStatus, setAddSkillStatus] = useState<AddSkillStatus>("idle");
  const [addSkillMessage, setAddSkillMessage] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);

  const filteredCatalogSkills = useMemo(
    () => availableSkills.filter((s) => !showOnlyUnbound || !s.bound),
    [availableSkills, showOnlyUnbound],
  );

  const currentModel = localOverride.model ?? agent.defaults.model;
  const currentMaxLoops = localOverride.maxLoops ?? agent.defaults.maxLoops;
  const currentSoul = localOverride.soul ?? agent.defaults.soul;
  const currentPrompt = localOverride.systemPrompt ?? agent.defaults.systemPrompt;

  const modelChanged = hasChanged(localOverride.model, agent.defaults.model);
  const loopsChanged = hasChanged(localOverride.maxLoops, agent.defaults.maxLoops);
  const soulChanged = hasChanged(localOverride.soul, agent.defaults.soul);
  const promptChanged = hasChanged(localOverride.systemPrompt, agent.defaults.systemPrompt);
  const anyChanged = modelChanged || loopsChanged || soulChanged || promptChanged;

  const uiMeta = getAgentUI(agent.id);

  const resetField = (field: keyof AgentOverride) => {
    onChange(agent.id, { [field]: undefined });
    if (saveStatus === "saved") setSaveStatus("idle");
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    const ok = await onSave(agent.id);
    setSaveStatus(ok ? "saved" : "error");
    if (ok) setTimeout(() => setSaveStatus("idle"), 2500);
  };

  const handleReuseSkill = async () => {
    const skillId = reuseSkillId.trim();
    if (!skillId) {
      setAddSkillStatus("error");
      setAddSkillMessage(t('agent.skillIdRequired'));
      return;
    }

    setAddSkillStatus("adding");
    setAddSkillMessage("");

    const result = await onAddSkill(agent.id, {
      mode: "reuse",
      skillId,
      description: reuseSkillDescription.trim(),
    });
    if (result.success) {
      setAddSkillStatus("success");
      setAddSkillMessage(result.message || t('agent.boundSkill', { id: skillId }));
      setReuseSkillId("");
      setReuseSkillDescription("");
      setTimeout(() => {
        setAddSkillStatus("idle");
        setAddSkillMessage("");
      }, 2500);
      return;
    }

    setAddSkillStatus("error");
    setAddSkillMessage(result.error || t('agent.addFailed'));
  };

  const handleInstallSkill = async () => {
    const command = installCommand.trim();
    if (!command) {
      setAddSkillStatus("error");
      setAddSkillMessage(t('agent.installCommandRequired'));
      return;
    }

    setAddSkillStatus("adding");
    setAddSkillMessage("");

    const result = await onAddSkill(agent.id, {
      mode: "install",
      installCommand: command,
      installedSkillIdHint: installedSkillIdHint.trim() || undefined,
    });
    if (result.success) {
      setAddSkillStatus("success");
      setAddSkillMessage(result.message || t('agent.installSuccess'));
      setTimeout(() => {
        setAddSkillStatus("idle");
        setAddSkillMessage("");
      }, 2500);
      return;
    }

    setAddSkillStatus("error");
    setAddSkillMessage(result.error || t('agent.installFailed'));
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    const loadSkills = async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const res = await fetch(`/api/settings/agents/skills?agentId=${encodeURIComponent(agent.id)}`);
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || t('agent.loadSkillsFailed'));
        }
        const skills = Array.isArray(json?.data?.skills) ? (json.data.skills as AvailableSkillOption[]) : [];
        if (cancelled) return;
        setAvailableSkills(skills);
        const firstUnbound = skills.find((s) => !s.bound)?.id;
        const first = skills[0]?.id;
        setSelectedCatalogSkillId(firstUnbound || first || "");
      } catch (e: any) {
        if (cancelled) return;
        setCatalogError(e?.message || t('agent.loadSkillsFailed'));
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };

    loadSkills();
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  useEffect(() => {
    if (
      selectedCatalogSkillId &&
      filteredCatalogSkills.some((skill) => skill.id === selectedCatalogSkillId)
    ) {
      return;
    }
    setSelectedCatalogSkillId(filteredCatalogSkills[0]?.id || "");
  }, [selectedCatalogSkillId, filteredCatalogSkills]);

  const handleBindSelectedSkill = async () => {
    const skillId = selectedCatalogSkillId.trim();
    if (!skillId) {
      setAddSkillStatus("error");
      setAddSkillMessage(t('agent.selectSkillFirst'));
      return;
    }

    setAddSkillStatus("adding");
    setAddSkillMessage("");
    const selected = availableSkills.find((s) => s.id === skillId);
    const result = await onAddSkill(agent.id, {
      mode: "reuse",
      skillId,
      description: selected?.description || "",
    });

    if (result.success) {
      setAddSkillStatus("success");
      setAddSkillMessage(result.message || t('agent.boundSkill', { id: skillId }));
      setTimeout(() => {
        setAddSkillStatus("idle");
        setAddSkillMessage("");
      }, 2500);
      const refreshed = availableSkills.map((s) => s.id === skillId ? { ...s, bound: true } : s);
      setAvailableSkills(refreshed);
      return;
    }

    setAddSkillStatus("error");
    setAddSkillMessage(result.error || t('agent.bindFailed'));
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{uiMeta?.emoji ?? "🤖"}</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-100">{agent.displayName}</h2>
                {agent.isAIGenerated && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-500/30">
                    AI
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">
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
                className="p-1.5 rounded-lg hover:bg-red-900/40 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
                title={t('common.delete')}
              >
                {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
          {/* Model */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-zinc-500 uppercase">
                Model {modelChanged && <span className="text-amber-400 ml-1">({t('common.modified')})</span>}
              </label>
              {modelChanged && (
                <button onClick={() => resetField("model")} className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1">
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
                  <button onClick={() => resetField("maxLoops")} className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1">
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

          {/* Soul */}
          <div>
            <button
              onClick={() => setSoulOpen(!soulOpen)}
              className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase hover:text-zinc-300 transition-colors"
            >
              <ChevronDown className={clsx("w-3 h-3 transition-transform", soulOpen && "rotate-180")} />
              Soul {soulChanged && <span className="text-amber-400">({t('common.modified')})</span>}
              {soulChanged && (
                <button
                  onClick={(e) => { e.stopPropagation(); resetField("soul"); }}
                  className="text-zinc-600 hover:text-zinc-300 flex items-center gap-1 ml-2"
                >
                  <RotateCcw className="w-3 h-3" /> {t('common.reset')}
                </button>
              )}
            </button>
            {soulOpen && (
              <textarea
                value={currentSoul}
                onChange={(e) => onChange(agent.id, { soul: e.target.value })}
                className="w-full mt-2 h-48 bg-black/50 border border-zinc-700/50 rounded-lg p-3 text-xs font-mono text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors resize-y leading-relaxed"
              />
            )}
          </div>

          {/* System Prompt */}
          <div>
            <button
              onClick={() => setPromptOpen(!promptOpen)}
              className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase hover:text-zinc-300 transition-colors"
            >
              <ChevronDown className={clsx("w-3 h-3 transition-transform", promptOpen && "rotate-180")} />
              System Prompt {promptChanged && <span className="text-amber-400">({t('common.modified')})</span>}
              {promptChanged && (
                <button
                  onClick={(e) => { e.stopPropagation(); resetField("systemPrompt"); }}
                  className="text-zinc-600 hover:text-zinc-300 flex items-center gap-1 ml-2"
                >
                  <RotateCcw className="w-3 h-3" /> {t('common.reset')}
                </button>
              )}
            </button>
            {promptOpen && (
              <textarea
                value={currentPrompt}
                onChange={(e) => onChange(agent.id, { systemPrompt: e.target.value })}
                className="w-full mt-2 h-64 bg-black/50 border border-zinc-700/50 rounded-lg p-3 text-xs font-mono text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors resize-y leading-relaxed"
              />
            )}
          </div>

          {/* Tools */}
          {agent.tools.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs font-mono text-zinc-500 uppercase">Tools</span>
              </div>
              <div className="space-y-1.5">
                {agent.tools.map((tool) => (
                  <div key={tool.name} className="flex items-start gap-2 bg-black/30 rounded-lg px-3 py-2">
                    <code className="text-xs text-blue-400 font-mono whitespace-nowrap">{tool.name}</code>
                    <span className="text-xs text-zinc-500">{tool.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-mono text-zinc-500 uppercase">Skills</span>
            </div>

            {agent.skills.length > 0 ? (
              <div className="space-y-1.5">
                {agent.skills.map((skill) => (
                  <div key={skill.name} className="flex items-start gap-2 bg-black/30 rounded-lg px-3 py-2">
                    <code className="text-xs text-green-400 font-mono whitespace-nowrap">{skill.name}</code>
                    <span className="text-xs text-zinc-500">{skill.description}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-600 bg-black/20 rounded-lg px-3 py-2">
                {t('agent.noSkills')}
              </div>
            )}

            <div className="mt-3 rounded-lg border border-zinc-800/80 bg-black/20 p-3 space-y-2">
              <p className="text-[11px] text-zinc-500 uppercase">{t('agent.reuseLocalSkill')}</p>
              <div className="grid grid-cols-1 gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={showOnlyUnbound}
                    onChange={(e) => setShowOnlyUnbound(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-black/60"
                  />
                  {t('agent.showUnboundOnly')}
                  <span className="text-zinc-600">
                    ({filteredCatalogSkills.length}/{availableSkills.length})
                  </span>
                </label>
                <select
                  value={selectedCatalogSkillId}
                  onChange={(e) => setSelectedCatalogSkillId(e.target.value)}
                  className="bg-black/50 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
                >
                  <option value="">
                    {catalogLoading ? t('agent.loadingSkills') : t('agent.selectFromDiscovered')}
                  </option>
                  {filteredCatalogSkills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.id} [{skill.source}] {skill.bound ? t('agent.alreadyBound') : ""}
                    </option>
                  ))}
                </select>
                {!catalogLoading && filteredCatalogSkills.length === 0 && (
                  <span className="text-xs text-zinc-600">
                    {t('agent.noFilteredSkills')}
                  </span>
                )}
                {catalogError && (
                  <span className="text-xs text-red-400">{catalogError}</span>
                )}
                <button
                  onClick={handleBindSelectedSkill}
                  disabled={addSkillStatus === "adding" || !selectedCatalogSkillId}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors w-fit"
                >
                  {addSkillStatus === "adding" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {t('agent.bindSelectedSkill')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={reuseSkillId}
                  onChange={(e) => setReuseSkillId(e.target.value)}
                  placeholder={t('agent.skillIdPlaceholder')}
                  className="bg-black/50 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
                <input
                  value={reuseSkillDescription}
                  onChange={(e) => setReuseSkillDescription(e.target.value)}
                  placeholder={t('agent.descriptionOptional')}
                  className="bg-black/50 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReuseSkill}
                  disabled={addSkillStatus === "adding"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                >
                  {addSkillStatus === "adding" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {t('agent.bindLocalSkill')}
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-zinc-800/80 bg-black/20 p-3 space-y-2">
              <p className="text-[11px] text-zinc-500 uppercase">{t('agent.externalInstall')}</p>
              <p className="text-[11px] text-zinc-600">
                {t('agent.externalInstallHint')} <code className="text-zinc-300">npx skills add xxx</code>
              </p>
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={installCommand}
                  onChange={(e) => setInstallCommand(e.target.value)}
                  placeholder={t('agent.installCommandPlaceholder')}
                  className="bg-black/50 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
                <input
                  value={installedSkillIdHint}
                  onChange={(e) => setInstalledSkillIdHint(e.target.value)}
                  placeholder={t('agent.installedSkillIdHint')}
                  className="bg-black/50 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleInstallSkill}
                  disabled={addSkillStatus === "adding"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                >
                  {addSkillStatus === "adding" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {addSkillStatus === "adding" ? t('agent.executing') : t('agent.executeInstall')}
                </button>
                {addSkillMessage && (
                  <span className={clsx(
                    "text-xs",
                    addSkillStatus === "error" ? "text-red-400" : "text-emerald-400",
                  )}>
                    {addSkillMessage}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal footer */}
        {anyChanged && (
          <div className="flex items-center gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-all"
            >
              {saveStatus === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saveStatus === "saved" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
              {saveStatus === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
              {saveStatus === "idle" && <Save className="w-3.5 h-3.5" />}
              {saveStatus === "saving" ? t('common.saving') : saveStatus === "saved" ? t('common.saved') : saveStatus === "error" ? t('common.saveFailed') : t('common.save')}
            </button>
            {saveStatus === "error" && (
              <span className="text-xs text-red-400">{t('agent.saveFailed')}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Card (Grid Tile) ─── */
export function AgentConfigCard({ agent, localOverride, onChange, onSave, onAddSkill, onDelete }: AgentConfigCardProps) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);

  const uiMeta = getAgentUI(agent.id);
  const currentModel = localOverride.model ?? agent.defaults.model;

  const modelChanged = hasChanged(localOverride.model, agent.defaults.model);
  const loopsChanged = hasChanged(localOverride.maxLoops, agent.defaults.maxLoops);
  const soulChanged = hasChanged(localOverride.soul, agent.defaults.soul);
  const promptChanged = hasChanged(localOverride.systemPrompt, agent.defaults.systemPrompt);
  const anyChanged = modelChanged || loopsChanged || soulChanged || promptChanged;

  const borderColorClass = uiMeta?.borderColor ?? "border-zinc-600";
  const badgeClass = uiMeta?.badgeClass ?? "bg-zinc-800 text-zinc-300";

  const soulSnippet = (localOverride.soul ?? agent.defaults.soul).slice(0, 60);

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className={clsx(
          "group relative rounded-xl bg-zinc-900/80 border border-zinc-800/60 overflow-hidden cursor-pointer",
          "hover:border-zinc-600/80 hover:bg-zinc-900 transition-all duration-200",
          "flex flex-col"
        )}
      >
        {/* Colored bottom accent */}
        <div className={clsx("absolute bottom-0 left-0 right-0 h-[3px]", uiMeta?.color ?? "bg-zinc-600")} />

        <div className="p-5 flex flex-col flex-1">
          {/* Top: Avatar + Name + Settings icon */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center text-xl",
                "bg-zinc-800/80 border border-zinc-700/50"
              )}>
                {uiMeta?.emoji ?? "🤖"}
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 leading-tight">{agent.displayName}</h3>
                <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{agent.role}</p>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
              className="p-1 rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          {/* Model */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-mono text-zinc-400">{currentModel}</span>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant={agent.id}>{agent.runMode}</Badge>
            {agent.isAIGenerated && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-300 border border-violet-500/30">
                AI
              </span>
            )}
            {agent.projectId && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {agent.projectId.slice(0, 8)}
              </span>
            )}
            {anyChanged && <Badge variant="warning">{t('common.modified')}</Badge>}
            {agent.tools.length > 0 && (
              <span className="text-[10px] text-zinc-600 font-mono">
                {agent.tools.length} tools
              </span>
            )}
            {agent.skills.length > 0 && (
              <span className="text-[10px] text-zinc-600 font-mono">
                {agent.skills.length} skills
              </span>
            )}
          </div>

          {/* Soul snippet */}
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 flex-1">
            {soulSnippet}{soulSnippet.length >= 60 ? "…" : ""}
          </p>

          {/* Bottom status dots */}
          <div className="flex items-center gap-1.5 mt-4">
            <span className={clsx("w-1.5 h-1.5 rounded-full", uiMeta?.color ?? "bg-zinc-600")} />
            <span className={clsx("w-1.5 h-1.5 rounded-full opacity-60", uiMeta?.color ?? "bg-zinc-600")} />
            <span className={clsx("w-1.5 h-1.5 rounded-full opacity-30", uiMeta?.color ?? "bg-zinc-600")} />
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {modalOpen && (
        <AgentEditModal
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
