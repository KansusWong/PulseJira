"use client";

import { useEffect, useState, useCallback } from "react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import {
  Users,
  RefreshCw,
  Loader2,
  Crown,
  ShieldAlert,
  Cpu,
  Check,
  Save,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirroring MateDefinition from lib/core/types.ts)
// ---------------------------------------------------------------------------

interface MateEntry {
  id: string;
  name: string;
  display_name?: string;
  description: string;
  domains: string[];
  tools_allow: string[];
  tools_deny: string[];
  model: string;
  can_lead: boolean;
  status: string;
  source: string;
  file_path?: string;
}

// ---------------------------------------------------------------------------
// MateAgentsCard
// ---------------------------------------------------------------------------

export function MateAgentsCard() {
  const { t } = useTranslation();
  const [mates, setMates] = useState<MateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMates = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/mates");
      const json = await res.json();
      if (json.success) {
        setMates(json.data || []);
        setError(null);
      } else {
        setError(json.error || t('mate.loadFailed'));
      }
    } catch {
      setError(t('mate.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchMates();
  }, [fetchMates]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/settings/mates", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setMates(json.data || []);
        setError(null);
      }
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-teal-400" />
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('mate.title')}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{t('mate.description')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)] font-mono bg-[var(--bg-elevated)] px-3 py-1.5 rounded-full">
            {t('mate.count', { count: mates.length })}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", refreshing && "animate-spin")} />
            {refreshing ? t('mate.refreshing') : t('mate.refresh')}
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-red-400 text-sm">{error}</div>
      ) : mates.length === 0 ? (
        <div className="text-center py-20 text-[var(--text-muted)] text-sm border border-dashed border-[var(--border-subtle)] rounded-xl">
          {t('mate.noMates')}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
        >
          {mates.map((mate) => (
            <MateCard key={mate.id} mate={mate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MateCard (individual card in the grid)
// ---------------------------------------------------------------------------

function MateCard({ mate }: { mate: MateEntry }) {
  const { t } = useTranslation();
  const [modelValue, setModelValue] = useState(mate.model);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty = modelValue !== mate.model;

  const handleSaveModel = useCallback(async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: mate.name, override: { model: modelValue } }),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [mate.name, modelValue, isDirty]);

  return (
    <div className="group relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-glass)] p-4 hover:border-[var(--border-subtle)] transition-all duration-200">
      {/* Top row: status + name + badges */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={clsx(
            "w-2 h-2 rounded-full flex-shrink-0",
            mate.status === "active" ? "bg-emerald-400" : "bg-[var(--bg-elevated)]"
          )} />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {mate.display_name || mate.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {mate.can_lead && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-500/20 text-amber-400">
              <Crown className="w-3 h-3" />
              Lead
            </span>
          )}
          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            {mate.source}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-3">
        {mate.description}
      </p>

      {/* Domains */}
      <div className="mb-3">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
          {t('mate.domains')}
        </div>
        {mate.domains.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {mate.domains.map((domain) => (
              <span
                key={domain}
                className="px-1.5 py-0.5 text-[10px] rounded bg-teal-500/10 text-teal-400 border border-teal-500/20"
              >
                {domain}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] italic">{t('mate.noDomains')}</span>
        )}
      </div>

      {/* Tools denied */}
      {mate.tools_deny.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
            <ShieldAlert className="w-3 h-3" />
            {t('mate.toolsDeny')}
          </div>
          <div className="flex flex-wrap gap-1">
            {mate.tools_deny.map((tool) => (
              <span
                key={tool}
                className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 border border-red-500/20"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Model selector */}
      <div>
        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
          <Cpu className="w-3 h-3" />
          {t('mate.model')}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={modelValue}
            onChange={(e) => setModelValue(e.target.value)}
            className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2 py-1 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-teal-500/50 transition-colors"
            placeholder="inherit"
          />
          {isDirty && (
            <button
              onClick={handleSaveModel}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : saved ? (
                <Check className="w-3 h-3" />
              ) : (
                <Save className="w-3 h-3" />
              )}
            </button>
          )}
          {saved && !isDirty && (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          )}
        </div>
      </div>
    </div>
  );
}
