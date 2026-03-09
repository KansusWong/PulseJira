"use client";

import { useState, useCallback, type ReactNode } from "react";
import clsx from "clsx";
import {
  Key,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Minus,
  Save,
  Loader2,
  RefreshCw,
  Database,
  Brain,
  Shield,
  Globe,
  Share2,
  GitBranch,
} from "lucide-react";
import { SqlExportSection } from "./SqlExportSection";
import { useTranslation } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Types (mirroring API response)
// ---------------------------------------------------------------------------

interface EnvVarInfo {
  key: string;
  label: string;
  isSecret: boolean;
  placeholder: string;
  helpText?: string;
  configured: boolean;
  maskedValue: string;
}

export interface EnvGroupInfo {
  id: string;
  label: string;
  icon: string;
  required: boolean;
  status: "configured" | "partial" | "missing";
  vars: EnvVarInfo[];
}

interface EnvConfigSectionProps {
  groups: EnvGroupInfo[];
  onSave: (values: Record<string, string>) => Promise<void>;
  saveStatus: "idle" | "saving" | "refreshing" | "saved" | "error";
}

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Database,
  Brain,
  Shield,
  Globe,
  Share2,
  GitBranch,
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: "configured" | "partial" | "missing" }) {
  const { t } = useTranslation();
  const styles = {
    configured: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    partial: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    missing: "bg-zinc-800 text-zinc-500 border-zinc-700",
  };
  const labels = { configured: t('env.configured'), partial: t('env.partial'), missing: t('env.missing') };
  return (
    <span
      className={clsx(
        "text-[10px] font-mono px-2 py-0.5 rounded-full border",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single variable input row
// ---------------------------------------------------------------------------

function EnvVarRow({
  info,
  value,
  onChange,
}: {
  info: EnvVarInfo;
  value: string;
  onChange: (key: string, val: string) => void;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  const displayPlaceholder = info.configured
    ? t('env.currentValue', { value: info.maskedValue })
    : info.placeholder;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {/* Status dot */}
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full shrink-0",
            info.configured ? "bg-emerald-500" : "bg-zinc-600"
          )}
        />
        <label className="text-xs text-zinc-400 font-medium">{info.label}</label>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={info.isSecret && !revealed ? "password" : "text"}
            value={value}
            onChange={(e) => onChange(info.key, e.target.value)}
            placeholder={displayPlaceholder}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
          />
          {info.isSecret && (
            <button
              type="button"
              onClick={() => setRevealed((p) => !p)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {revealed ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group accordion
// ---------------------------------------------------------------------------

function EnvGroup({
  group,
  values,
  onChange,
  extra,
  extraCountTotal = 0,
  extraCountConfigured = 0,
}: {
  group: EnvGroupInfo;
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  extra?: ReactNode;
  extraCountTotal?: number;
  extraCountConfigured?: number;
}) {
  const [expanded, setExpanded] = useState(
    true
  );

  const Icon = iconMap[group.icon] || Key;
  const totalCount = group.vars.length + extraCountTotal;
  const configuredCount =
    group.vars.filter((v) => v.configured).length + extraCountConfigured;

  return (
    <div
      className={clsx(
        "rounded-lg border transition-colors",
        group.status === "configured"
          ? "bg-emerald-500/5 border-emerald-500/10"
          : group.status === "partial"
          ? "bg-amber-500/5 border-amber-500/10"
          : "bg-zinc-900/50 border-zinc-800"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">
            {group.label}
          </span>
          <StatusBadge status={group.status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 font-mono">
            {configuredCount}/{totalCount}
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-800/50 pt-3">
          {group.vars.map((v) => (
            <EnvVarRow
              key={v.key}
              info={v}
              value={values[v.key] || ""}
              onChange={onChange}
            />
          ))}
          {extra && <div className="pt-1">{extra}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EnvConfigSection({
  groups,
  onSave,
  saveStatus,
}: EnvConfigSectionProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [sqlExportReady, setSqlExportReady] = useState(false);

  const handleChange = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = async () => {
    // Filter out empty values that don't clear an existing config
    const payload: Record<string, string> = {};
    for (const [key, val] of Object.entries(values)) {
      if (val.trim() !== "") {
        payload[key] = val.trim();
      }
    }
    if (Object.keys(payload).length === 0) return;
    await onSave(payload);
    setValues({});
  };

  const changedCount = Object.values(values).filter((v) => v.trim() !== "")
    .length;

  return (
    <div className="bg-paper border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Key className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-100">
              {t('env.title')}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {t('env.description')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {groups.map((group) => (
          <EnvGroup
            key={group.id}
            group={group}
            values={values}
            onChange={handleChange}
            extra={
              group.id === "supabase" ? (
                <SqlExportSection
                  embedded
                  onStatusChange={setSqlExportReady}
                />
              ) : undefined
            }
            extraCountTotal={group.id === "supabase" ? 1 : 0}
            extraCountConfigured={group.id === "supabase" && sqlExportReady ? 1 : 0}
          />
        ))}

        {/* Save */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-zinc-600">
            {changedCount > 0 && (
              <span className="text-amber-400">
                {t('env.pendingCount', { count: changedCount })}
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={
              changedCount === 0 ||
              saveStatus === "saving" ||
              saveStatus === "refreshing"
            }
            className={clsx(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all",
              saveStatus === "saved"
                ? "bg-emerald-500/20 text-emerald-400"
                : saveStatus === "error"
                ? "bg-red-500/20 text-red-400"
                : "bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
            )}
          >
            {saveStatus === "saving" && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            {saveStatus === "refreshing" && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            )}
            {saveStatus === "saved" && (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {saveStatus === "error" && (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            {saveStatus === "idle" && <Save className="w-3.5 h-3.5" />}
            {saveStatus === "saving"
              ? t('env.savingConfig')
              : saveStatus === "refreshing"
              ? t('env.refreshingConfig')
              : saveStatus === "saved"
              ? t('common.saved')
              : saveStatus === "error"
              ? t('common.saveFailed')
              : t('env.saveAndRefresh')}
          </button>
        </div>
      </div>
    </div>
  );
}
