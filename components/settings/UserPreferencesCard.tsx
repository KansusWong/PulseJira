"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Target,
  Radio,
  Plus,
  X,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  Link2,
  KeyRound,
  Trash2,
  Play,
  Power,
  PowerOff,
  Eye,
  EyeOff,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

interface PlatformConfig {
  enabled: boolean;
  sources: string[];
}

interface UserPreferences {
  topics: string[];
  platforms: Record<string, PlatformConfig>;
  updatedAt: string;
}

interface PlatformPreset {
  id: string;
  label: string;
  description: string;
  identifier: string;
  keywords?: string[];
}

interface PlatformCatalogItem {
  key: string;
  label: string;
  icon: string;
  color: string;
  sourcePlaceholder: string;
  sourceLabel: string;
  description: string;
  supportsAutoFromPreferences: boolean;
  envKeys: string[];
  presets: PlatformPreset[];
  available: boolean;
}

interface EnvVarInfo {
  key: string;
  label: string;
  isSecret: boolean;
  placeholder: string;
  helpText?: string;
  configured: boolean;
  maskedValue: string;
}

interface SignalSourceRow {
  id: string;
  platform: string;
  identifier: string;
  label: string;
  keywords: string[];
  interval_minutes: number;
  active: boolean;
  last_fetched_at: string | null;
  created_at: string;
}

interface DraftSource {
  platformName: string;
  url: string;
  active: boolean;
}

type DeleteTarget =
  | { kind: "explicit-source"; source: SignalSourceRow }
  | { kind: "auto-platform"; platformKey: string; platformLabel: string };

type SaveStatus = "idle" | "saving" | "saved" | "error";
type SourceTestStatus = "idle" | "testing" | "success" | "empty" | "error";

const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-400", dot: "bg-orange-500" },
  sky: { bg: "bg-sky-500/10", border: "border-sky-500/20", text: "text-sky-400", dot: "bg-sky-500" },
  red: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400", dot: "bg-red-500" },
  violet: { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-400", dot: "bg-violet-500" },
};

function defaultConfig(): PlatformConfig {
  return { enabled: true, sources: [] };
}

function normalizeSourceUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildSiteIdentifier(rawUrl: string): string {
  const normalizedUrl = normalizeSourceUrl(rawUrl);
  if (!normalizedUrl) return "";

  try {
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, "");
    return `site:${hostname}`;
  } catch {
    return "";
  }
}

function parseKeywordInput(raw: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const item of String(raw || "").split(",")) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(trimmed);
  }

  return keywords;
}

function normalizePreferences(
  prefs: UserPreferences,
  catalog: PlatformCatalogItem[]
): UserPreferences {
  const nextPlatforms: Record<string, PlatformConfig> = {
    ...(prefs.platforms || {}),
  };

  for (const platform of catalog) {
    if (!nextPlatforms[platform.key]) {
      nextPlatforms[platform.key] = defaultConfig();
    }
  }

  return {
    topics: Array.isArray(prefs.topics) ? prefs.topics : [],
    platforms: nextPlatforms,
    updatedAt: prefs.updatedAt || "",
  };
}

type PreferencesView = "all" | "topics" | "platforms";

interface UserPreferencesCardProps {
  view?: PreferencesView;
}

export function UserPreferencesCard({ view = "all" }: UserPreferencesCardProps) {
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<UserPreferences>({
    topics: [],
    platforms: {},
    updatedAt: "",
  });
  const [platformCatalog, setPlatformCatalog] = useState<PlatformCatalogItem[]>([]);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [topicInput, setTopicInput] = useState("");
  const [sourceInputs, setSourceInputs] = useState<Record<string, string>>({});
  const [sourceKeywordInputs, setSourceKeywordInputs] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [fetchIntervalHours, setFetchIntervalHours] = useState<number>(5);

  const [socialVars, setSocialVars] = useState<EnvVarInfo[]>([]);
  const [credentialInputs, setCredentialInputs] = useState<Record<string, string>>({});
  const [credentialVisibility, setCredentialVisibility] = useState<Record<string, boolean>>({});
  const [credentialStatus, setCredentialStatus] = useState<SaveStatus>("idle");

  const [signalSources, setSignalSources] = useState<SignalSourceRow[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceCreating, setSourceCreating] = useState(false);
  const [workingSourceIds, setWorkingSourceIds] = useState<Set<string>>(new Set());
  const [workingPlatformKeys, setWorkingPlatformKeys] = useState<Set<string>>(new Set());
  const [draftSource, setDraftSource] = useState<DraftSource>({
    platformName: "",
    url: "",
    active: true,
  });
  const [sourceTestStatus, setSourceTestStatus] = useState<SourceTestStatus>("idle");
  const [sourceTestMessage, setSourceTestMessage] = useState("");
  const [showCredentialModule, setShowCredentialModule] = useState(false);
  const [newSourceModalOpen, setNewSourceModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);

  const autoPlatforms = useMemo(
    () => platformCatalog.filter((platform) => platform.supportsAutoFromPreferences),
    [platformCatalog]
  );

  const generatedIdentifier = useMemo(
    () => buildSiteIdentifier(draftSource.url),
    [draftSource.url]
  );

  const loadSignalSources = useCallback(async () => {
    setSourceLoading(true);
    try {
      const res = await fetch("/api/signals/sources?limit=200");
      const json = await res.json();
      if (json.success) {
        setSignalSources(Array.isArray(json.data) ? json.data : []);
      } else {
        setSourceError(json.error || t("prefs.loadSourcesFailed"));
      }
    } catch {
      setSourceError(t("prefs.loadSourcesFailed"));
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prefRes, envRes, sysConfigRes] = await Promise.all([
        fetch("/api/settings/preferences"),
        fetch("/api/settings/env"),
        fetch("/api/settings/system-config"),
      ]);

      const prefJson = await prefRes.json();
      const envJson = await envRes.json();
      const sysConfigJson = await sysConfigRes.json();

      if (prefJson.success && prefJson.data) {
        const catalog = (prefJson.data.platformCatalog || []) as PlatformCatalogItem[];
        const pref = normalizePreferences(prefJson.data.preferences, catalog);
        setPlatformCatalog(catalog);
        setPreferences(pref);
        setAvailable(prefJson.data.availablePlatforms || {});
      }

      if (envJson.success && envJson.data?.groups) {
        const socialGroup = (envJson.data.groups as any[]).find((group) => group.id === "social");
        setSocialVars(socialGroup?.vars || []);
      }

      if (sysConfigJson.success && sysConfigJson.data) {
        const interval = Number(sysConfigJson.data.signal_fetch_interval_hours);
        if (interval >= 1) setFetchIntervalHours(interval);
      }

      await loadSignalSources();
    } finally {
      setLoading(false);
    }
  }, [loadSignalSources]);

  useEffect(() => {
    loadAll().catch(() => {
      setLoading(false);
    });
  }, [loadAll]);

  const handleAddTopic = useCallback(() => {
    const topic = topicInput.trim();
    if (!topic) return;
    if (preferences.topics.includes(topic)) {
      setTopicInput("");
      return;
    }
    setPreferences((prev) => ({ ...prev, topics: [...prev.topics, topic] }));
    setTopicInput("");
  }, [topicInput, preferences.topics]);

  const handleRemoveTopic = useCallback((topic: string) => {
    setPreferences((prev) => ({
      ...prev,
      topics: prev.topics.filter((item) => item !== topic),
    }));
  }, []);

  const handleAddAutoSource = useCallback(
    (platformKey: string) => {
      const value = (sourceInputs[platformKey] || "").trim();
      if (!value) return;

      const incoming = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      setPreferences((prev) => {
        const platformConfig = prev.platforms[platformKey] || defaultConfig();
        const merged = Array.from(new Set([...platformConfig.sources, ...incoming]));
        return {
          ...prev,
          platforms: {
            ...prev.platforms,
            [platformKey]: {
              ...platformConfig,
              sources: merged,
            },
          },
        };
      });

      setSourceInputs((prev) => ({ ...prev, [platformKey]: "" }));
    },
    [sourceInputs]
  );

  const handleRemoveAutoSource = useCallback((platformKey: string, source: string) => {
    setPreferences((prev) => {
      const platformConfig = prev.platforms[platformKey] || defaultConfig();
      return {
        ...prev,
        platforms: {
          ...prev.platforms,
          [platformKey]: {
            ...platformConfig,
            sources: platformConfig.sources.filter((item) => item !== source),
          },
        },
      };
    });
  }, []);

  const runPlatformAction = useCallback(async (platformKey: string, action: () => Promise<void>) => {
    setWorkingPlatformKeys((prev) => new Set(prev).add(platformKey));
    try {
      await action();
    } finally {
      setWorkingPlatformKeys((prev) => {
        const next = new Set(prev);
        next.delete(platformKey);
        return next;
      });
    }
  }, []);

  const persistPlatforms = useCallback(
    async (nextPlatforms: Record<string, PlatformConfig>, fallbackError: string): Promise<boolean> => {
      setSourceError(null);
      try {
        const res = await fetch("/api/settings/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platforms: nextPlatforms }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setSourceError(json?.error || fallbackError);
          return false;
        }
        setPreferences((prev) => ({
          ...prev,
          platforms: nextPlatforms,
          updatedAt: json.data?.updatedAt || new Date().toISOString(),
        }));
        return true;
      } catch {
        setSourceError(fallbackError);
        return false;
      }
    },
    []
  );

  const handleSetAutoPlatformEnabled = useCallback(
    (platformKey: string, enabled: boolean) => {
      const platformConfig = preferences.platforms[platformKey] || defaultConfig();
      if (platformConfig.enabled === enabled) return;
      void runPlatformAction(platformKey, async () => {
        const nextPlatforms: Record<string, PlatformConfig> = {
          ...preferences.platforms,
          [platformKey]: {
            ...platformConfig,
            enabled,
          },
        };
        await persistPlatforms(nextPlatforms, enabled ? t("prefs.enablePlatformFailed") : t("prefs.disablePlatformFailed"));
      });
    },
    [persistPlatforms, preferences.platforms, runPlatformAction]
  );

  const handleSavePreferences = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const [prefRes, sysRes] = await Promise.all([
        fetch("/api/settings/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topics: preferences.topics,
            platforms: preferences.platforms,
          }),
        }),
        fetch("/api/settings/system-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signal_fetch_interval_hours: Math.max(1, fetchIntervalHours),
          }),
        }),
      ]);
      const prefJson = await prefRes.json();
      const sysJson = await sysRes.json();
      if (prefJson.success && sysJson.success) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  }, [preferences, fetchIntervalHours]);

  const handleSaveCredentials = useCallback(async () => {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentialInputs)) {
      const trimmed = value.trim();
      if (trimmed) payload[key] = trimmed;
    }

    if (Object.keys(payload).length === 0) return;

    setCredentialStatus("saving");
    try {
      const res = await fetch("/api/settings/env", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vars: payload }),
      });
      const json = await res.json();
      if (json.success) {
        setCredentialInputs({});
        setCredentialStatus("saved");
        await loadAll();
        setTimeout(() => setCredentialStatus("idle"), 2000);
      } else {
        setCredentialStatus("error");
      }
    } catch {
      setCredentialStatus("error");
    }
  }, [credentialInputs, loadAll]);

  const handleDraftSourceFieldChange = useCallback(
    (patch: Partial<DraftSource>) => {
      setDraftSource((prev) => ({ ...prev, ...patch }));
      setSourceError(null);
      setSourceTestStatus("idle");
      setSourceTestMessage("");
      setShowCredentialModule(false);
    },
    []
  );

  const handleTestSource = useCallback(async () => {
    if (!draftSource.platformName.trim()) {
      setSourceTestStatus("error");
      setSourceTestMessage(t("prefs.testPlatformNameFirst"));
      return;
    }

    if (!draftSource.url.trim()) {
      setSourceTestStatus("error");
      setSourceTestMessage(t("prefs.testUrlFirst"));
      return;
    }

    setSourceError(null);
    setSourceTestStatus("testing");
    setSourceTestMessage("");

    try {
      const res = await fetch("/api/signals/sources/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformName: draftSource.platformName.trim(),
          url: draftSource.url.trim(),
          keywords: preferences.topics.join(","),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setSourceTestStatus("error");
        setSourceTestMessage(json.error || t("prefs.testFailed"));
        setShowCredentialModule(false);
        return;
      }

      const count = Number(json.data?.count || 0);
      if (count > 0) {
        setSourceTestStatus("success");
        setSourceTestMessage(t("prefs.testSuccess", { count }));
        setShowCredentialModule(false);
      } else {
        setSourceTestStatus("empty");
        setSourceTestMessage(t("prefs.testEmpty"));
        setShowCredentialModule(false);
      }
    } catch {
      setSourceTestStatus("error");
      setSourceTestMessage(t("prefs.testRetryLater"));
      setShowCredentialModule(false);
    }
  }, [draftSource.platformName, draftSource.url, preferences.topics]);

  const handleCreateSource = useCallback(async () => {
    const platformName = draftSource.platformName.trim();
    if (!platformName) {
      setSourceError(t("prefs.platformNameRequiredError"));
      return;
    }

    if (!draftSource.url.trim()) {
      setSourceError(t("prefs.urlRequiredError"));
      return;
    }

    const normalizedUrl = normalizeSourceUrl(draftSource.url);
    if (!normalizedUrl) {
      setSourceError(t("prefs.urlFormatError"));
      return;
    }

    const identifier = buildSiteIdentifier(draftSource.url);
    if (!identifier) {
      setSourceError(t("prefs.identifierError"));
      return;
    }

    setSourceCreating(true);
    setSourceError(null);

    try {
      const res = await fetch("/api/signals/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "generic-web",
          label: platformName,
          identifier,
          keywords: preferences.topics,
          interval_minutes: 60,
          active: draftSource.active,
          config: {
            mode: "crawl4ai-site",
            platformName,
            url: normalizedUrl,
            query_hint_keywords: preferences.topics,
          },
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setSourceError(json.error || t("prefs.createSourceFailed"));
        return;
      }

      setSignalSources((prev) => [json.data as SignalSourceRow, ...prev]);
      setDraftSource((prev) => ({
        ...prev,
        platformName: "",
        url: "",
        active: true,
      }));
      setSourceTestStatus("idle");
      setSourceTestMessage("");
      setShowCredentialModule(false);
      setNewSourceModalOpen(false);
    } catch {
      setSourceError(t("prefs.createSourceFailed"));
    } finally {
      setSourceCreating(false);
    }
  }, [draftSource, preferences.topics]);

  const runSourceAction = useCallback(async (sourceId: string, action: () => Promise<void>) => {
    setWorkingSourceIds((prev) => new Set(prev).add(sourceId));
    try {
      await action();
    } finally {
      setWorkingSourceIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
    }
  }, []);

  const handleSetSourceActive = useCallback(
    async (source: SignalSourceRow, nextActive: boolean) => {
      if (source.active === nextActive) return;
      await runSourceAction(source.id, async () => {
        const res = await fetch(`/api/signals/sources/${source.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: nextActive }),
        });
        const json = await res.json();
        if (!json.success) {
          setSourceError(json.error || (nextActive ? t("prefs.enableSourceFailed") : t("prefs.disableSourceFailed")));
          return;
        }
        setSignalSources((prev) =>
          prev.map((row) => (row.id === source.id ? { ...row, active: nextActive } : row))
        );
      });
    },
    [runSourceAction]
  );

  const handleDeleteSource = useCallback(
    async (source: SignalSourceRow) => {
      await runSourceAction(source.id, async () => {
        setSourceError(null);
        try {
          const res = await fetch(`/api/signals/sources/${source.id}`, {
            method: "DELETE",
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) {
            setSourceError(json?.error || t("prefs.deleteSourceFailed", { status: res.status }));
            return;
          }
          setSignalSources((prev) => prev.filter((row) => row.id !== source.id));
        } catch {
          setSourceError(t("prefs.deleteSourceNetworkFailed"));
        }
      });
    },
    [runSourceAction]
  );

  const openDeleteModal = useCallback((target: DeleteTarget) => {
    setDeleteTarget(target);
    setDeleteConfirmInput("");
    setDeleteConfirmChecked(false);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteConfirmInput("");
    setDeleteConfirmChecked(false);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const confirmTokenValid = deleteConfirmInput.trim().toUpperCase() === "DELETE";
    if (!deleteConfirmChecked || !confirmTokenValid) return;

    if (deleteTarget.kind === "explicit-source") {
      await handleDeleteSource(deleteTarget.source);
      closeDeleteModal();
      return;
    }

    await runPlatformAction(deleteTarget.platformKey, async () => {
      const platformConfig = preferences.platforms[deleteTarget.platformKey] || defaultConfig();
      const nextPlatforms: Record<string, PlatformConfig> = {
        ...preferences.platforms,
        [deleteTarget.platformKey]: {
          ...platformConfig,
          enabled: false,
          sources: [],
        },
      };
      const success = await persistPlatforms(nextPlatforms, t("prefs.deletePlatformFailed"));
      if (success) closeDeleteModal();
    });
  }, [
    closeDeleteModal,
    deleteConfirmChecked,
    deleteConfirmInput,
    deleteTarget,
    handleDeleteSource,
    persistPlatforms,
    preferences.platforms,
    runPlatformAction,
  ]);

  const handleAddSourceKeyword = useCallback(
    async (source: SignalSourceRow) => {
      const incoming = parseKeywordInput(sourceKeywordInputs[source.id] || "");
      if (incoming.length === 0) return;

      const merged = Array.from(new Set([...(source.keywords || []), ...incoming]));
      await runSourceAction(source.id, async () => {
        setSourceError(null);
        try {
          const res = await fetch(`/api/signals/sources/${source.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keywords: merged }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) {
            setSourceError(json?.error || t("prefs.updateKeywordsFailed", { status: res.status }));
            return;
          }
          const nextKeywords = Array.isArray(json.data?.keywords) ? json.data.keywords : merged;
          setSignalSources((prev) =>
            prev.map((row) => (row.id === source.id ? { ...row, keywords: nextKeywords } : row))
          );
          setSourceKeywordInputs((prev) => ({ ...prev, [source.id]: "" }));
        } catch {
          setSourceError(t("prefs.updateKeywordsRetryLater"));
        }
      });
    },
    [runSourceAction, sourceKeywordInputs]
  );

  const handleRemoveSourceKeyword = useCallback(
    async (source: SignalSourceRow, keyword: string) => {
      const nextKeywords = (source.keywords || []).filter((item) => item !== keyword);
      await runSourceAction(source.id, async () => {
        setSourceError(null);
        try {
          const res = await fetch(`/api/signals/sources/${source.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keywords: nextKeywords }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) {
            setSourceError(json?.error || t("prefs.updateKeywordsFailed", { status: res.status }));
            return;
          }
          const persisted = Array.isArray(json.data?.keywords) ? json.data.keywords : nextKeywords;
          setSignalSources((prev) =>
            prev.map((row) => (row.id === source.id ? { ...row, keywords: persisted } : row))
          );
        } catch {
          setSourceError(t("prefs.updateKeywordsRetryLater"));
        }
      });
    },
    [runSourceAction]
  );

  const showTopics = view !== "platforms";
  const showPlatforms = view !== "topics";
  const showSavePreferences = view !== "platforms";

  if (loading) {
    return (
      <div className="glass-1 rounded-xl p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  const canConfirmDelete = deleteConfirmChecked && deleteConfirmInput.trim().toUpperCase() === "DELETE";
  const deleteWorking =
    deleteTarget?.kind === "explicit-source"
      ? workingSourceIds.has(deleteTarget.source.id)
      : deleteTarget?.kind === "auto-platform"
      ? workingPlatformKeys.has(deleteTarget.platformKey)
      : false;

  return (
    <>
    <div className="glass-1 rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={clsx("p-2 rounded-lg", view === "platforms" ? "bg-cyan-500/10" : "bg-amber-500/10")}>
              {view === "platforms" ? (
                <Radio className="w-5 h-5 text-cyan-400" />
              ) : (
                <Target className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {view === "topics" ? t("prefs.title.topics") : view === "platforms" ? t("prefs.title.platforms") : t("prefs.title.all")}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {view === "topics"
                  ? t("prefs.desc.topics")
                  : view === "platforms"
                  ? t("prefs.desc.platforms")
                  : t("prefs.desc.all")}
              </p>
            </div>
          </div>
          {showPlatforms && (
            <button
              type="button"
              onClick={() => setNewSourceModalOpen(true)}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/25"
            >
              {t("prefs.newSource")}
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-8">
        {showTopics && (
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] mb-3 block">{t("prefs.interestedTopics")}</label>
            {preferences.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {preferences.topics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-full border border-[var(--border-subtle)]"
                  >
                    {topic}
                    <button
                      onClick={() => handleRemoveTopic(topic)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={topicInput}
                onChange={(event) => setTopicInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddTopic();
                  }
                }}
                placeholder={t("prefs.topicPlaceholder")}
                className="flex-1 bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)] transition-colors"
              />
              <button
                onClick={handleAddTopic}
                disabled={!topicInput.trim()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-lg border border-[var(--border-subtle)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("common.add")}
              </button>
            </div>

            {preferences.topics.length === 0 && (
              <p className="text-[11px] text-[var(--text-muted)] mt-2 flex items-center gap-1.5">
                <Info className="w-3 h-3" />
                {t("prefs.topicHint")}
              </p>
            )}

            <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
              <label className="text-sm font-medium text-[var(--text-primary)] mb-2 block">
                {t("prefs.fetchInterval")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={fetchIntervalHours}
                  onChange={(event) => {
                    const v = parseInt(event.target.value, 10);
                    if (!Number.isNaN(v) && v >= 1) setFetchIntervalHours(v);
                  }}
                  className="w-24 bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-accent)] transition-colors"
                />
                <span className="text-sm text-[var(--text-secondary)]">
                  {t("prefs.fetchIntervalUnit")}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5 flex items-center gap-1.5">
                <Info className="w-3 h-3" />
                {t("prefs.fetchIntervalHint")}
              </p>
            </div>
          </div>
        )}

        {showPlatforms && (
          <div>
            <div className="space-y-3">
              {autoPlatforms.map((platform) => {
                const colors = colorMap[platform.color] || {
                  bg: "bg-[var(--bg-elevated)]",
                  border: "border-[var(--border-subtle)]",
                  text: "text-[var(--text-primary)]",
                  dot: "bg-[var(--bg-elevated)]",
                };
                const config = preferences.platforms[platform.key] || defaultConfig();
                const isAvailable = available[platform.key] ?? platform.available;
                const platformEnabled = config.enabled !== false;
                const platformWorking = workingPlatformKeys.has(platform.key);

                return (
                  <div
                    key={platform.key}
                    className={clsx(
                      "rounded-lg border p-4 transition-colors",
                      isAvailable ? `${colors.bg} ${colors.border}` : "bg-[var(--bg-glass)] border-[var(--border-subtle)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-base mt-0.5">{platform.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-medium text-[var(--text-primary)]">{platform.label}</span>
                          {!isAvailable ? (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                              {t("prefs.credentialsNotConfigured")}
                            </span>
                          ) : (
                            <span
                              className={clsx(
                                "text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1",
                                colors.bg,
                                colors.text
                              )}
                            >
                              <span
                                className={clsx("w-1.5 h-1.5 rounded-full", platformEnabled ? colors.dot : "bg-[var(--bg-elevated)]")}
                              />
                              {platformEnabled ? t("common.active") : t("common.paused")}
                            </span>
                          )}
                        </div>
                      </div>
                      </div>
                      {isAvailable && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleSetAutoPlatformEnabled(platform.key, true)}
                            disabled={platformWorking || platformEnabled}
                            className={clsx(
                              "p-1.5 rounded-md transition-colors disabled:opacity-40",
                              platformEnabled
                                ? "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                            )}
                            title={platformEnabled ? t("common.enabled") : t("common.start")}
                          >
                            {platformWorking && !platformEnabled ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleSetAutoPlatformEnabled(platform.key, false)}
                            disabled={platformWorking || !platformEnabled}
                            className={clsx(
                              "p-1.5 rounded-md transition-colors disabled:opacity-40",
                              platformEnabled
                                ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                            )}
                            title={platformEnabled ? t("common.pause") : t("common.paused")}
                          >
                            {platformEnabled ? (
                              <Power className="w-3.5 h-3.5" />
                            ) : (
                              <PowerOff className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              openDeleteModal({
                                kind: "auto-platform",
                                platformKey: platform.key,
                                platformLabel: platform.label,
                              })
                            }
                            disabled={platformWorking}
                            className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            title={t("common.delete")}
                          >
                            {platformWorking ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {isAvailable && (
                      <div className="mt-3 pl-7">
                        <label className="text-[11px] text-[var(--text-muted)] font-medium mb-2 block uppercase tracking-wider">
                          {platform.sourceLabel}
                        </label>

                        {config.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {config.sources.map((source) => (
                              <span
                                key={source}
                                className={clsx(
                                  "inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border",
                                  colors.bg,
                                  colors.border,
                                  colors.text
                                )}
                              >
                                {source}
                                <button
                                  onClick={() => handleRemoveAutoSource(platform.key, source)}
                                  className="opacity-60 hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={sourceInputs[platform.key] || ""}
                            onChange={(event) =>
                              setSourceInputs((prev) => ({
                                ...prev,
                                [platform.key]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                handleAddAutoSource(platform.key);
                              }
                            }}
                            placeholder={platform.sourcePlaceholder}
                            className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)] transition-colors"
                          />
                          <button
                            onClick={() => handleAddAutoSource(platform.key)}
                            disabled={!(sourceInputs[platform.key] || "").trim()}
                            className="px-2 py-1.5 text-[11px] font-medium bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {sourceLoading && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-4 py-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("prefs.loadingExplicitSources")}
                </div>
              )}
              {sourceError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
                  {sourceError}
                </div>
              )}
              {!sourceLoading &&
                signalSources.map((source) => {
                  const platform = platformCatalog.find((item) => item.key === source.platform) || null;
                  const colors = colorMap[platform?.color || "violet"] || {
                    bg: "bg-[var(--bg-elevated)]",
                    border: "border-[var(--border-subtle)]",
                    text: "text-[var(--text-primary)]",
                    dot: "bg-[var(--bg-elevated)]",
                  };
                  const working = workingSourceIds.has(source.id);
                  const sourceKeywords = Array.isArray(source.keywords) ? source.keywords : [];

                  return (
                    <div
                      key={source.id}
                      className={clsx("rounded-lg border p-4 transition-colors", `${colors.bg} ${colors.border}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{platform?.icon || "🌐"}</span>
                            <span className="text-sm font-medium text-[var(--text-primary)]">{source.label}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                              {t("prefs.explicitSource")}
                            </span>
                            <span
                              className={clsx(
                                "text-[10px] px-1.5 py-0.5 rounded border",
                                source.active
                                  ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                                  : "text-[var(--text-muted)] border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                              )}
                            >
                              {source.active ? t("common.active") : t("common.paused")}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleSetSourceActive(source, true)}
                            disabled={working || source.active}
                            className={clsx(
                              "p-1.5 rounded-md transition-colors disabled:opacity-40",
                              source.active
                                ? "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                            )}
                            title={source.active ? t("common.enabled") : t("common.start")}
                          >
                            {working && !source.active ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleSetSourceActive(source, false)}
                            disabled={working || !source.active}
                            className={clsx(
                              "p-1.5 rounded-md transition-colors disabled:opacity-40",
                              source.active
                                ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                            )}
                            title={source.active ? t("common.pause") : t("common.paused")}
                          >
                            {source.active ? (
                              <Power className="w-3.5 h-3.5" />
                            ) : (
                              <PowerOff className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => openDeleteModal({ kind: "explicit-source", source })}
                            disabled={working}
                            className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            title={t("common.delete")}
                          >
                            {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 pl-7 space-y-2">
                        <p className="text-[11px] text-[var(--text-muted)] break-all">{source.identifier}</p>
                        <label className="text-[11px] text-[var(--text-muted)] font-medium block uppercase tracking-wider">
                          {t("prefs.searchKeywordsOptional")}
                        </label>
                        {sourceKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {sourceKeywords.map((keyword) => (
                              <span
                                key={keyword}
                                className={clsx(
                                  "inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border",
                                  colors.bg,
                                  colors.border,
                                  colors.text
                                )}
                              >
                                {keyword}
                                <button
                                  onClick={() => handleRemoveSourceKeyword(source, keyword)}
                                  disabled={working}
                                  className="opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={sourceKeywordInputs[source.id] || ""}
                            onChange={(event) =>
                              setSourceKeywordInputs((prev) => ({
                                ...prev,
                                [source.id]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                handleAddSourceKeyword(source);
                              }
                            }}
                            placeholder="e.g. AI coding, LLM tools, developer productivity"
                            className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)] transition-colors"
                          />
                          <button
                            onClick={() => handleAddSourceKeyword(source)}
                            disabled={working || !(sourceKeywordInputs[source.id] || "").trim()}
                            className="px-2 py-1.5 text-[11px] font-medium bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {newSourceModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setNewSourceModalOpen(false);
              }
            }}
          >
            <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-glass)] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("prefs.addNewSource")}</h3>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {t("prefs.explicitSourceCount", { count: signalSources.length })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setNewSourceModalOpen(false)}
                  className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t("prefs.sourceDefaultHint")}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={draftSource.platformName}
                    onChange={(event) =>
                      handleDraftSourceFieldChange({ platformName: event.target.value })
                    }
                    placeholder={t("prefs.platformNameRequired")}
                    className="bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
                  />
                  <input
                    type="text"
                    value={draftSource.url}
                    onChange={(event) =>
                      handleDraftSourceFieldChange({ url: event.target.value })
                    }
                    placeholder={t("prefs.urlRequired")}
                    className="bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)]"
                  />
                  <input
                    type="text"
                    value={generatedIdentifier}
                    readOnly
                    placeholder="site:example.com"
                    className="md:col-span-2 bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-muted)]"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={draftSource.active}
                      onChange={(event) =>
                        handleDraftSourceFieldChange({ active: event.target.checked })
                      }
                    />
                    {t("prefs.enableAfterCreate")}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestSource}
                      disabled={
                        sourceCreating ||
                        sourceTestStatus === "testing" ||
                        !draftSource.platformName.trim() ||
                        !draftSource.url.trim()
                      }
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg border border-[var(--border-subtle)] transition-colors disabled:opacity-40"
                    >
                      {sourceTestStatus === "testing" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      {t("prefs.testCrawl")}
                    </button>
                    <button
                      onClick={handleCreateSource}
                      disabled={sourceCreating || !draftSource.platformName.trim() || !draftSource.url.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 rounded-lg border border-cyan-500/30 transition-colors disabled:opacity-40"
                    >
                      {sourceCreating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      {t("prefs.addSource")}
                    </button>
                  </div>
                </div>

                {sourceTestStatus !== "idle" && sourceTestMessage && (
                  <p
                    className={clsx(
                      "text-xs",
                      sourceTestStatus === "success"
                        ? "text-emerald-400"
                        : sourceTestStatus === "testing"
                        ? "text-[var(--text-secondary)]"
                        : sourceTestStatus === "empty"
                        ? "text-amber-400"
                        : "text-red-400"
                    )}
                  >
                    {sourceTestMessage}
                  </p>
                )}
                {sourceError && <p className="text-xs text-red-400">{sourceError}</p>}

                {showCredentialModule && (
                  <div className="border-t border-[var(--border-subtle)] pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <KeyRound className="w-4 h-4 text-emerald-400" />
                      <label className="text-sm font-medium text-[var(--text-primary)]">{t("prefs.tokenApiKeyEntry")}</label>
                    </div>

                    {socialVars.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">{t("prefs.noCredentials")}</p>
                    ) : (
                      <div className="space-y-3">
                        {socialVars.map((envVar) => (
                          <div key={envVar.key} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--text-primary)]">{envVar.label}</span>
                                <span className="text-[10px] font-mono text-[var(--text-muted)]">{envVar.key}</span>
                              </div>
                              <span
                                className={clsx(
                                  "text-[10px] font-mono px-2 py-0.5 rounded-full border",
                                  envVar.configured
                                    ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                                    : "text-[var(--text-muted)] border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                                )}
                              >
                                {envVar.configured ? t("prefs.configured", { value: envVar.maskedValue }) : t("prefs.notConfigured")}
                              </span>
                            </div>
                            <div className="relative">
                              <input
                                type={
                                  envVar.isSecret && !credentialVisibility[envVar.key]
                                    ? "password"
                                    : "text"
                                }
                                value={credentialInputs[envVar.key] || ""}
                                onChange={(event) =>
                                  setCredentialInputs((prev) => ({
                                    ...prev,
                                    [envVar.key]: event.target.value,
                                  }))
                                }
                                placeholder={t("prefs.credentialPlaceholder")}
                                className="w-full bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)] transition-colors font-mono"
                              />
                              {envVar.isSecret && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCredentialVisibility((prev) => ({
                                      ...prev,
                                      [envVar.key]: !prev[envVar.key],
                                    }))
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                  {credentialVisibility[envVar.key] ? (
                                    <EyeOff className="w-3.5 h-3.5" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        <div className="flex justify-end">
                          <button
                            onClick={handleSaveCredentials}
                            disabled={credentialStatus === "saving"}
                            className={clsx(
                              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all",
                              credentialStatus === "saved"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : credentialStatus === "error"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-white text-black hover:bg-white/90"
                            )}
                          >
                            {credentialStatus === "saving" && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            )}
                            {credentialStatus === "saved" && (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {credentialStatus === "error" && (
                              <AlertCircle className="w-3.5 h-3.5" />
                            )}
                            {credentialStatus === "idle" && <Save className="w-3.5 h-3.5" />}
                            {credentialStatus === "saving"
                              ? t("common.saving")
                              : credentialStatus === "saved"
                              ? t("common.saved")
                              : credentialStatus === "error"
                              ? t("common.saveFailed")
                              : t("prefs.saveCredentials")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-[var(--text-muted)]">
            {preferences.updatedAt && (
              <>
                {t("prefs.lastUpdated")}
                {new Date(preferences.updatedAt).toLocaleString(locale === 'zh' ? "zh-CN" : "en-US")}
              </>
            )}
          </div>
          {showSavePreferences && (
            <button
              onClick={handleSavePreferences}
              disabled={saveStatus === "saving"}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all",
                saveStatus === "saved"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : saveStatus === "error"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-white text-black hover:bg-white/90"
              )}
            >
              {saveStatus === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saveStatus === "saved" && <CheckCircle2 className="w-3.5 h-3.5" />}
              {saveStatus === "error" && <AlertCircle className="w-3.5 h-3.5" />}
              {saveStatus === "idle" && <Save className="w-3.5 h-3.5" />}
              {saveStatus === "saving"
                ? t("common.saving")
                : saveStatus === "saved"
                ? t("common.saved")
                : saveStatus === "error"
                ? t("common.saveFailed")
                : t("prefs.savePreferences")}
            </button>
          )}
        </div>
      </div>
    </div>
    {deleteTarget && (
      <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-glass)] shadow-2xl">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("prefs.deleteConfirmTitle")}</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {deleteTarget.kind === "explicit-source"
                ? t("prefs.deleteSourceConfirm", { name: deleteTarget.source.label })
                : t("prefs.deletePlatformConfirm", { name: deleteTarget.platformLabel })}
            </p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <label className="flex items-start gap-2 text-xs text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={deleteConfirmChecked}
                onChange={(event) => setDeleteConfirmChecked(event.target.checked)}
                className="mt-0.5"
              />
              {t("prefs.deleteIrreversible")}
            </label>
            <div>
              <p className="text-[11px] text-[var(--text-muted)] mb-1.5">{t("prefs.typeDeleteToContinue")}</p>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(event) => setDeleteConfirmInput(event.target.value)}
                placeholder="DELETE"
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-red-500/50"
              />
            </div>
          </div>
          <div className="px-5 py-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
            <button
              onClick={closeDeleteModal}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={!canConfirmDelete || deleteWorking}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-200 bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-40"
            >
              {t("prefs.confirmDelete")}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
