"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import { toast } from "@/components/ui/Toast";
import { AgentConfigCard } from "@/components/settings/AgentConfigCard";
import { MateAgentsCard } from "@/components/settings/MateAgentsCard";
import { AdvancedSettingsCard } from "@/components/settings/AdvancedSettingsCard";
import { WebhookConfigCard } from "@/components/settings/WebhookConfigCard";
import { SetupCard } from "@/components/settings/SetupCard";
import { LLMPoolCard } from "@/components/settings/LLMPoolCard";
import { LanguageSwitcher } from "@/components/settings/LanguageSwitcher";
import { SkillRow } from "@/components/settings/SkillRow";
import { SkillUploadArea } from "@/components/settings/SkillUploadArea";
import { SkillStudioPanel } from "@/components/studio/SkillStudioPanel";
import { usePulseStore } from "@/store/usePulseStore.new";

// Lazy-load recharts-heavy component — only loaded when "usage" tab is active
const UsageSnapshotCard = dynamic(
  () => import("@/components/settings/UsageSnapshotCard").then((m) => m.UsageSnapshotCard),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    ),
  },
);
const SqlExportSection = dynamic(
  () => import("@/components/settings/SqlExportSection").then((m) => m.SqlExportSection),
  { ssr: false },
);

type SettingsTab = "agent" | "llm-pool" | "skills" | "preferences" | "advanced";

function normalizeTab(rawTab: string | null): SettingsTab {
  if (!rawTab) return "agent";
  if (rawTab === "agent" || rawTab === "llm-pool" || rawTab === "skills" || rawTab === "preferences" || rawTab === "advanced") {
    return rawTab;
  }
  // Legacy tab mapping
  if (rawTab === "setup" || rawTab === "advanced-topics" || rawTab === "advanced-platforms") return "preferences";
  if (rawTab === "agents" || rawTab === "mates") return "agent";
  if (rawTab === "usage" || rawTab === "webhooks") return "advanced";
  return "agent";
}

interface SkillItem {
  id: string;
  description: string;
  source: "project" | "codex" | "registry";
  bound: boolean;
  enabled: boolean;
}

interface AgentOverride {
  model?: string;
  maxLoops?: number;
  soul?: string;
  systemPrompt?: string;
}

interface AgentEntry {
  id: string;
  displayName: string;
  role: string;
  runMode: "react" | "single-shot";
  isAIGenerated?: boolean;
  createdBy?: string;
  projectId?: string;
  defaults: {
    model: string;
    maxLoops: number;
    soul: string;
    systemPrompt: string;
  };
  override: AgentOverride;
  skills: Array<{ name: string; description: string }>;
  tools: Array<{ name: string; description: string }>;
}

interface AddSkillPayload {
  mode: "reuse" | "install";
  skillId?: string;
  description?: string;
  installCommand?: string;
  installedSkillIdHint?: string;
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = normalizeTab(searchParams.get("tab"));

  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("rebuild");
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Agent state
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [overrides, setOverrides] = useState<Record<string, AgentOverride>>({});
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Studio panel state (from zustand)
  const openStudioTab = usePulseStore((s) => s.openStudioTab);
  const studioVisible = usePulseStore((s) => s.studioPanel.visible);
  const studioActiveTabId = usePulseStore((s) => s.studioPanel.activeTabId);

  // Fetch agents for the agent tab
  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const res = await fetch("/api/settings/agents");
      const json = await res.json();
      if (json.success && json.data) {
        setAgents(json.data);
        const initial: Record<string, AgentOverride> = {};
        for (const agent of json.data as AgentEntry[]) {
          initial[agent.id] = { ...agent.override };
        }
        setOverrides(initial);
      }
    } catch (err) {
      toast(t("settings.agentLoadFailed") || "Failed to load agents", "error");
    } finally {
      setLoadingAgents(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab === "agent") {
      fetchAgents();
    }
  }, [activeTab, fetchAgents]);

  // Fetch skills for the skills tab
  const fetchSkills = useCallback(async () => {
    setLoadingSkills(true);
    try {
      const res = await fetch(`/api/settings/skills?agentId=${selectedAgentId}`);
      const json = await res.json();
      if (json.success && json.data?.skills) {
        setSkills(json.data.skills);
      }
    } catch (err) {
      toast(t("settings.skillLoadFailed") || "Failed to load skills", "error");
    } finally {
      setLoadingSkills(false);
    }
  }, [selectedAgentId, t]);

  useEffect(() => {
    if (activeTab === "skills") {
      fetchSkills();
    }
  }, [activeTab, fetchSkills]);

  // Auto-save helper with debounce
  const handleAutoSave = useCallback(
    async (saveFn: () => Promise<boolean>, successMessage?: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const success = await saveFn();
          if (success) {
            toast(successMessage || t("common.saved") || "Saved", "info");
          } else {
            toast(t("common.saveFailed") || "Failed to save — Retry", "error");
          }
        } catch (err) {
          toast(t("common.saveFailed") || "Failed to save — Retry", "error");
        }
      }, 500);
    },
    [t],
  );

  // Skill toggle handler
  const handleSkillToggle = useCallback(
    async (skillId: string, enabled: boolean) => {
      try {
        const res = await fetch("/api/settings/skills", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: selectedAgentId, skillId, enabled }),
        });
        const json = await res.json();
        if (json.success) {
          toast(t("settings.skillToggled") || "Saved", "info");
          fetchSkills();
        } else {
          toast(json.error || (t("common.saveFailed") || "Failed to save"), "error");
        }
      } catch (err) {
        toast(t("common.saveFailed") || "Failed to save — Retry", "error");
      }
    },
    [selectedAgentId, fetchSkills, t],
  );

  // Skill remove handler
  const handleSkillRemove = useCallback(
    async (skillId: string) => {
      try {
        const res = await fetch("/api/settings/skills", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: selectedAgentId, skillId }),
        });
        const json = await res.json();
        if (json.success) {
          toast(t("settings.skillRemoved") || "Removed", "info");
          fetchSkills();
        } else {
          toast(json.error || (t("common.deleteFailed") || "Failed to remove"), "error");
        }
      } catch (err) {
        toast(t("common.deleteFailed") || "Failed to remove — Retry", "error");
      }
    },
    [selectedAgentId, fetchSkills, t],
  );

  // Skill uploaded handler
  const handleSkillUploaded = useCallback(
    (skillId: string) => {
      toast(t("settings.skillUploaded") || "Skill uploaded", "success");
      fetchSkills();
    },
    [fetchSkills, t],
  );

  // Skill edit handler
  const handleSkillEdit = useCallback(
    (skillId: string) => {
      openStudioTab(skillId, skillId);
    },
    [openStudioTab],
  );

  // Tab change handler
  const handleTabChange = useCallback(
    (tab: SettingsTab) => {
      router.push(`/settings?tab=${tab}`);
    },
    [router],
  );

  // Agent handlers
  const handleAgentChange = useCallback((agentId: string, patch: Partial<AgentOverride>) => {
    setOverrides((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], ...patch },
    }));
  }, []);

  const handleAgentSave = useCallback(
    async (agentId: string): Promise<boolean> => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) return false;

      const ov = overrides[agentId] || {};
      const cleaned: AgentOverride = {};
      if (ov.model !== undefined && ov.model !== agent.defaults.model) cleaned.model = ov.model;
      if (ov.maxLoops !== undefined && ov.maxLoops !== agent.defaults.maxLoops)
        cleaned.maxLoops = ov.maxLoops;
      if (ov.soul !== undefined && ov.soul !== agent.defaults.soul) cleaned.soul = ov.soul;
      if (ov.systemPrompt !== undefined && ov.systemPrompt !== agent.defaults.systemPrompt)
        cleaned.systemPrompt = ov.systemPrompt;

      try {
        const res = await fetch("/api/settings/agents", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, override: cleaned }),
        });
        const json = await res.json();
        if (json.success) {
          toast(t("common.saved") || "Saved", "info");
          return true;
        } else {
          toast(json.error || (t("common.saveFailed") || "Failed to save"), "error");
          return false;
        }
      } catch (err) {
        toast(t("common.saveFailed") || "Failed to save — Retry", "error");
        return false;
      }
    },
    [agents, overrides, t],
  );

  const handleAddSkill = useCallback(
    async (
      agentId: string,
      payload: AddSkillPayload,
    ): Promise<{ success: boolean; error?: string; message?: string }> => {
      try {
        const res = await fetch("/api/settings/agents/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, ...payload }),
        });
        const json = await res.json();
        if (!json.success) {
          return { success: false, error: json.error || t("agent.addSkillFailed") };
        }
        fetchAgents();
        const data = json.data || {};
        const bound = Array.isArray(data.boundSkills) ? data.boundSkills : [];
        return {
          success: true,
          message:
            bound.length > 0
              ? t("settings.skillBound", { list: bound.join(", ") })
              : t("settings.addSuccess"),
        };
      } catch (err) {
        return { success: false, error: t("agent.addSkillFailed") };
      }
    },
    [fetchAgents, t],
  );

  const handleDeleteAgent = useCallback(
    async (agentId: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/settings/agents", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        });
        const json = await res.json();
        if (json.success) {
          toast(t("common.deleted") || "Deleted", "info");
          fetchAgents();
          return true;
        }
        return false;
      } catch (err) {
        toast(t("common.deleteFailed") || "Failed to delete", "error");
        return false;
      }
    },
    [fetchAgents, t],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="py-8 px-6 w-full max-w-[720px] mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-[20px] font-semibold text-[var(--text-primary)] mb-1">
            {t("settings.title") || "Settings"}
          </h1>
          <p className="text-[12.5px] text-[var(--text-muted)]">
            {t("settings.subtitle") || "Configure your workspace, agents, and integrations"}
          </p>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-6 border-b border-[var(--border-subtle)] mb-6">
          <button
            onClick={() => handleTabChange("agent")}
            className={clsx(
              "pb-3 text-sm font-medium transition-colors relative",
              activeTab === "agent"
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {t("settings.tabs.agent") || "Agent"}
            {activeTab === "agent" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
            )}
          </button>
          <button
            onClick={() => handleTabChange("llm-pool")}
            className={clsx(
              "pb-3 text-sm font-medium transition-colors relative",
              activeTab === "llm-pool"
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {t("settings.tabs.llmPool") || "LLM Pool"}
            {activeTab === "llm-pool" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
            )}
          </button>
          <button
            onClick={() => handleTabChange("skills")}
            className={clsx(
              "pb-3 text-sm font-medium transition-colors relative",
              activeTab === "skills"
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {t("settings.tabs.skills") || "Skills"}
            {activeTab === "skills" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
            )}
          </button>
          <button
            onClick={() => handleTabChange("preferences")}
            className={clsx(
              "pb-3 text-sm font-medium transition-colors relative",
              activeTab === "preferences"
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {t("settings.tabs.preferences") || "Preferences"}
            {activeTab === "preferences" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
            )}
          </button>
          <button
            onClick={() => handleTabChange("advanced")}
            className={clsx(
              "pb-3 text-sm font-medium transition-colors relative",
              activeTab === "advanced"
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {t("settings.tabs.advanced") || "Advanced"}
            {activeTab === "advanced" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />
            )}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "agent" && (
          <div className="flex flex-col gap-4">
            {loadingAgents ? (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="glass-1 rounded-xl p-4 space-y-3">
                    <div className="h-6 w-32 rounded shimmer" />
                    <div className="h-4 w-full rounded shimmer" />
                    <div className="h-4 w-3/4 rounded shimmer" />
                  </div>
                ))}
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-20 text-zinc-500 text-sm border border-dashed border-zinc-700 rounded-lg">
                {t("agent.noAgents") || "No agents available"}
              </div>
            ) : (
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
              >
                {agents.map((agent) => (
                  <AgentConfigCard
                    key={agent.id}
                    agent={agent}
                    localOverride={overrides[agent.id] || {}}
                    onChange={handleAgentChange}
                    onSave={handleAgentSave}
                    onAddSkill={handleAddSkill}
                    onDelete={agent.isAIGenerated || agent.createdBy === 'subagent' ? handleDeleteAgent : undefined}
                  />
                ))}
              </div>
            )}
            <MateAgentsCard />
          </div>
        )}

        {activeTab === "llm-pool" && (
          <div className="flex flex-col gap-4">
            <LLMPoolCard />
          </div>
        )}

        {activeTab === "skills" && (
          <div className="flex flex-col gap-4">
            {/* Show studio panel if visible and a skill is being edited */}
            {studioVisible && studioActiveTabId ? (
              <div className="h-[600px]">
                <SkillStudioPanel />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Skills header */}
                <div>
                  <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                    {t("settings.skillsTitle") || "Skills"}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t("settings.skillsDescription") || "Manage skills for your agents"}
                  </p>
                </div>

                {/* Skill upload area */}
                <SkillUploadArea onUploaded={handleSkillUploaded} />

                {/* Skills list */}
                {loadingSkills ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="glass-1 rounded-lg p-4 space-y-2">
                        <div className="h-5 w-48 rounded shimmer" />
                        <div className="h-4 w-full rounded shimmer" />
                      </div>
                    ))}
                  </div>
                ) : skills.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-sm border border-dashed border-zinc-700 rounded-lg">
                    {t("settings.noSkills") || "No skills available"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {skills.map((skill) => (
                      <SkillRow
                        key={skill.id}
                        name={skill.id}
                        description={skill.description}
                        enabled={skill.enabled}
                        onToggle={(enabled) => handleSkillToggle(skill.id, enabled)}
                        onRemove={() => handleSkillRemove(skill.id)}
                        onEdit={() => handleSkillEdit(skill.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "preferences" && (
          <div className="flex flex-col gap-4">
            <SetupCard />
            <LanguageSwitcher />
          </div>
        )}

        {activeTab === "advanced" && (
          <div className="flex flex-col gap-4">
            <AdvancedSettingsCard />
            <WebhookConfigCard />
            <UsageSnapshotCard />
            <SqlExportSection />
          </div>
        )}
      </div>
    </div>
  );
}
