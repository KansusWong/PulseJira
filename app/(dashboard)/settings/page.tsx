"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Bot, Loader2, Plus, X } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import { AgentConfigCard } from "@/components/settings/AgentConfigCard";
import { UserPreferencesCard } from "@/components/settings/UserPreferencesCard";
import { AdvancedSettingsCard } from "@/components/settings/AdvancedSettingsCard";
import { WebhookConfigCard } from "@/components/settings/WebhookConfigCard";

// Lazy-load recharts-heavy component — only loaded when "usage" tab is active (#16)
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
import { SetupCard } from "@/components/settings/SetupCard";
import { LLMPoolCard } from "@/components/settings/LLMPoolCard";
import type { AgentEntry } from "@/components/settings/AgentConfigCard";

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

interface NewAgentDraft {
  displayName: string;
  role: string;
  model: string;
  maxLoops: number;
  systemPrompt: string;
  soul: string;
}

type SettingsTab =
  | "setup"
  | "advanced-platforms"
  | "advanced-topics"
  | "llm-pool"
  | "agents"
  | "usage"
  | "advanced"
  | "webhooks";

function normalizeTab(rawTab: string | null): SettingsTab {
  if (!rawTab) return "setup";
  if (rawTab === "preferences") return "advanced-topics";
  if (rawTab === "setup" || rawTab === "advanced-platforms" || rawTab === "advanced-topics" || rawTab === "llm-pool" || rawTab === "agents" || rawTab === "usage" || rawTab === "advanced" || rawTab === "webhooks") {
    return rawTab;
  }
  return "setup";
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));

  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [overrides, setOverrides] = useState<Record<string, AgentOverride>>({});
  const [loading, setLoading] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [newAgent, setNewAgent] = useState<NewAgentDraft>({
    displayName: "",
    role: "",
    model: "",
    maxLoops: 10,
    systemPrompt: "",
    soul: "",
  });

  useEffect(() => {
    setContentReady(false);
    const raf = requestAnimationFrame(() => setContentReady(true));
    return () => cancelAnimationFrame(raf);
  }, [tab]);

  const fetchAgents = useCallback(() => {
    setLoading(true);
    fetch("/api/settings/agents")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setAgents(json.data);
          const initial: Record<string, AgentOverride> = {};
          for (const agent of json.data as AgentEntry[]) {
            initial[agent.id] = { ...agent.override };
          }
          setOverrides(initial);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "agents") return;
    fetchAgents();
  }, [tab, fetchAgents]);

  const handleCreateAgent = useCallback(async () => {
    const displayName = newAgent.displayName.trim();
    if (!displayName) {
      setCreateError(t('agent.nameRequiredError'));
      return;
    }

    setCreateError(null);
    setCreatingAgent(true);
    try {
      const res = await fetch("/api/settings/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          role: newAgent.role.trim(),
          model: newAgent.model.trim(),
          maxLoops: newAgent.maxLoops,
          systemPrompt: newAgent.systemPrompt.trim(),
          soul: newAgent.soul.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setCreateError(json.error || t('agent.createAgentFailed'));
        return;
      }
      setCreateModalOpen(false);
      setNewAgent({
        displayName: "",
        role: "",
        model: "",
        maxLoops: 10,
        systemPrompt: "",
        soul: "",
      });
      fetchAgents();
    } catch {
      setCreateError(t('agent.createAgentFailed'));
    } finally {
      setCreatingAgent(false);
    }
  }, [newAgent, fetchAgents]);

  const handleChange = useCallback((agentId: string, patch: Partial<AgentOverride>) => {
    setOverrides((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], ...patch },
    }));
  }, []);

  const handleSave = useCallback(async (agentId: string): Promise<boolean> => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return false;

    const ov = overrides[agentId] || {};
    const cleaned: AgentOverride = {};
    if (ov.model !== undefined && ov.model !== agent.defaults.model) cleaned.model = ov.model;
    if (ov.maxLoops !== undefined && ov.maxLoops !== agent.defaults.maxLoops) cleaned.maxLoops = ov.maxLoops;
    if (ov.soul !== undefined && ov.soul !== agent.defaults.soul) cleaned.soul = ov.soul;
    if (ov.systemPrompt !== undefined && ov.systemPrompt !== agent.defaults.systemPrompt) cleaned.systemPrompt = ov.systemPrompt;

    try {
      const res = await fetch("/api/settings/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, override: cleaned }),
      });
      const json = await res.json();
      return json.success === true;
    } catch {
      return false;
    }
  }, [agents, overrides]);

  const handleDeleteAgent = useCallback(async (agentId: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/settings/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const json = await res.json();
      if (json.success) {
        fetchAgents();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [fetchAgents]);

  const handleAddSkill = useCallback(async (
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
        return { success: false, error: json.error || t('agent.addSkillFailed') };
      }
      fetchAgents();
      const data = json.data || {};
      const bound = Array.isArray(data.boundSkills) ? data.boundSkills : [];
      return {
        success: true,
        message: bound.length > 0 ? t('settings.skillBound', { list: bound.join(", ") }) : t('settings.addSuccess'),
      };
    } catch {
      return { success: false, error: t('agent.addSkillFailed') };
    }
  }, [fetchAgents]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="py-8 px-6 w-full">
        <div
          className={clsx(
            "transition-opacity duration-300 ease-out",
            contentReady ? "opacity-100" : "opacity-0"
          )}
        >
          {/* Setup Tab */}
          {tab === "setup" && <SetupCard />}

          {/* Advanced Config Tabs */}
          {tab === "advanced-topics" && <UserPreferencesCard view="topics" />}
          {tab === "advanced-platforms" && <UserPreferencesCard view="platforms" />}

          {/* Usage Tab */}
          {tab === "usage" && <UsageSnapshotCard />}

          {/* LLM Pool Tab */}
          {tab === "llm-pool" && <LLMPoolCard />}

          {/* Advanced Settings Tab */}
          {tab === "advanced" && <AdvancedSettingsCard />}

          {/* Webhooks Tab */}
          {tab === "webhooks" && <WebhookConfigCard />}

          {/* Agents Tab */}
          {tab === "agents" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Bot className="w-6 h-6 text-purple-400" />
                  <div>
                    <h2 className="text-lg font-bold text-zinc-100">{t('agent.title')}</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {t('agent.description')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 font-mono bg-zinc-800/60 px-3 py-1.5 rounded-full">
                    {t('agent.running', { count: agents.length })}
                  </span>
                  <button
                    onClick={() => {
                      setCreateError(null);
                      setCreateModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('agent.createAgent')}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : agents.length === 0 ? (
                <div className="text-center py-20 text-zinc-600 text-sm">
                  {t('agent.noAgents')}
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                  {agents.map((agent) => (
                    <AgentConfigCard
                      key={agent.id}
                      agent={agent}
                      localOverride={overrides[agent.id] || {}}
                      onChange={handleChange}
                      onSave={handleSave}
                      onAddSkill={handleAddSkill}
                      onDelete={agent.isAIGenerated ? handleDeleteAgent : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !creatingAgent) {
              setCreateModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-200">{t('agent.createAgentTitle')}</h3>
              <button
                onClick={() => !creatingAgent && setCreateModalOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  value={newAgent.displayName}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, displayName: e.target.value }))}
                  placeholder={t('agent.agentNameRequired')}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <input
                  value={newAgent.role}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, role: e.target.value }))}
                  placeholder={t('agent.roleOptional')}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <input
                  value={newAgent.model}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder={t('agent.modelOptional')}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={newAgent.maxLoops}
                  onChange={(e) =>
                    setNewAgent((prev) => ({
                      ...prev,
                      maxLoops: Math.min(50, Math.max(1, Number(e.target.value || 10))),
                    }))
                  }
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <textarea
                value={newAgent.systemPrompt}
                onChange={(e) => setNewAgent((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                rows={4}
                placeholder={t('agent.systemPromptOptional')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-y"
              />

              <textarea
                value={newAgent.soul}
                onChange={(e) => setNewAgent((prev) => ({ ...prev, soul: e.target.value }))}
                rows={3}
                placeholder={t('agent.soulOptional')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-y"
              />

              {createError && <p className="text-xs text-red-400">{createError}</p>}

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creatingAgent}
                  className="px-3 py-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateAgent}
                  disabled={creatingAgent || !newAgent.displayName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creatingAgent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {creatingAgent ? t('common.creating') : t('agent.createAgent')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
