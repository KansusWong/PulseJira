"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { SkillRow } from "./SkillRow";
import { SkillUploadArea } from "./SkillUploadArea";

interface SkillInfo {
  name: string;
  description: string;
  enabled?: boolean;
}

interface AvailableSkillOption {
  id: string;
  description: string;
  source: "project" | "codex" | "registry";
  bound: boolean;
  enabled: boolean;
}

interface AgentSkillPanelProps {
  agentId: string;
  skills: SkillInfo[];
  onAddSkill: (agentId: string, payload: { mode: "reuse"; skillId: string; description?: string }) => Promise<{ success: boolean; error?: string; message?: string }>;
}

export function AgentSkillPanel({ agentId, skills, onAddSkill }: AgentSkillPanelProps) {
  const { t } = useTranslation();
  const [availableSkills, setAvailableSkills] = useState<AvailableSkillOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [selectedCatalogSkillId, setSelectedCatalogSkillId] = useState("");
  const [showOnlyUnbound, setShowOnlyUnbound] = useState(false);
  const [bindingStatus, setBindingStatus] = useState<"idle" | "adding">("idle");
  const [bindMessage, setBindMessage] = useState("");

  // Merge skills with their enabled status from the skills API
  const [boundSkills, setBoundSkills] = useState<Array<{ name: string; description: string; enabled: boolean }>>([]);

  const loadSkills = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const res = await fetch(`/api/settings/skills?agentId=${encodeURIComponent(agentId)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load skills");

      const allSkills = Array.isArray(json?.data?.skills) ? (json.data.skills as AvailableSkillOption[]) : [];
      setAvailableSkills(allSkills);

      // Build bound skills list
      const bound = allSkills.filter((s) => s.bound);
      setBoundSkills(bound.map((s) => ({ name: s.id, description: s.description, enabled: s.enabled })));

      const firstUnbound = allSkills.find((s) => !s.bound)?.id;
      setSelectedCatalogSkillId(firstUnbound || allSkills[0]?.id || "");
    } catch (e: any) {
      setCatalogError(e?.message || "Failed to load skills");
    } finally {
      setCatalogLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const filteredCatalogSkills = useMemo(
    () => availableSkills.filter((s) => !showOnlyUnbound || !s.bound),
    [availableSkills, showOnlyUnbound],
  );

  useEffect(() => {
    if (selectedCatalogSkillId && filteredCatalogSkills.some((s) => s.id === selectedCatalogSkillId)) return;
    setSelectedCatalogSkillId(filteredCatalogSkills[0]?.id || "");
  }, [selectedCatalogSkillId, filteredCatalogSkills]);

  const handleToggle = async (skillName: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/settings/agents/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, skillName, enabled }),
      });
      const json = await res.json();
      if (json.success) {
        setBoundSkills((prev) =>
          prev.map((s) => (s.name === skillName ? { ...s, enabled } : s)),
        );
      }
    } catch {
      // silent
    }
  };

  const handleRemove = async (skillName: string) => {
    try {
      const res = await fetch("/api/settings/agents/skills", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, skillName }),
      });
      const json = await res.json();
      if (json.success) {
        setBoundSkills((prev) => prev.filter((s) => s.name !== skillName));
        setAvailableSkills((prev) =>
          prev.map((s) => (s.id === skillName ? { ...s, bound: false } : s)),
        );
      }
    } catch {
      // silent
    }
  };

  const handleBindSelected = async () => {
    const skillId = selectedCatalogSkillId.trim();
    if (!skillId) return;

    setBindingStatus("adding");
    setBindMessage("");
    const selected = availableSkills.find((s) => s.id === skillId);
    const result = await onAddSkill(agentId, {
      mode: "reuse",
      skillId,
      description: selected?.description || "",
    });

    if (result.success) {
      setBindMessage(result.message || t('agent.boundSkill', { id: skillId }));
      await loadSkills();
    } else {
      setBindMessage(result.error || t('agent.bindFailed'));
    }
    setBindingStatus("idle");
    setTimeout(() => setBindMessage(""), 3000);
  };

  const handleUploaded = async (skillId: string) => {
    // After upload, bind to this agent and refresh
    await onAddSkill(agentId, { mode: "reuse", skillId });
    await loadSkills();
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* Section 1: Bound skills */}
      <div>
        <h4 className="text-xs font-mono text-[var(--text-muted)] uppercase mb-2">
          {t('agent.enabledSkills')} ({boundSkills.length})
        </h4>
        {boundSkills.length > 0 ? (
          <div className="space-y-1.5">
            {boundSkills.map((skill) => (
              <SkillRow
                key={skill.name}
                name={skill.name}
                description={skill.description}
                enabled={skill.enabled}
                onToggle={(enabled) => handleToggle(skill.name, enabled)}
                onRemove={() => handleRemove(skill.name)}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] rounded-lg px-3 py-2">
            {t('agent.noSkills')}
          </div>
        )}
      </div>

      {/* Section 2: Upload */}
      <div>
        <h4 className="text-xs font-mono text-[var(--text-muted)] uppercase mb-2">
          {t('agent.uploadSkill')}
        </h4>
        <SkillUploadArea onUploaded={handleUploaded} />
      </div>

      {/* Section 3: Available skill pool */}
      <div>
        <h4 className="text-xs font-mono text-[var(--text-muted)] uppercase mb-2">
          {t('agent.reuseLocalSkill')}
        </h4>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2">
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showOnlyUnbound}
              onChange={(e) => setShowOnlyUnbound(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--border-default)] bg-[var(--bg-surface)]"
            />
            {t('agent.showUnboundOnly')}
            <span className="text-[var(--text-muted)]">
              ({filteredCatalogSkills.length}/{availableSkills.length})
            </span>
          </label>

          <select
            value={selectedCatalogSkillId}
            onChange={(e) => setSelectedCatalogSkillId(e.target.value)}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-accent)]"
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

          {catalogError && <span className="text-xs text-red-400">{catalogError}</span>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleBindSelected}
              disabled={bindingStatus === "adding" || !selectedCatalogSkillId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
            >
              {bindingStatus === "adding" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('agent.bindSelectedSkill')}
            </button>
            {bindMessage && (
              <span className="text-xs text-[var(--text-secondary)]">{bindMessage}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
