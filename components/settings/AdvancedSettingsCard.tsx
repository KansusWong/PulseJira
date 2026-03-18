"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings2, Loader2, Check, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

type ExecutionMode = "simple" | "medium" | "advanced";
type TrustLevel = "auto" | "standard" | "collaborative";

interface ModeConfig {
  key: ExecutionMode;
  colorClass: string;
  borderClass: string;
  bgClass: string;
  disabled: boolean;
}

interface TrustConfig {
  key: TrustLevel;
  colorClass: string;
  borderClass: string;
  bgClass: string;
}

const MODES: ModeConfig[] = [
  {
    key: "simple",
    colorClass: "text-green-400",
    borderClass: "border-green-500",
    bgClass: "bg-green-500/10",
    disabled: false,
  },
  {
    key: "medium",
    colorClass: "text-yellow-400",
    borderClass: "border-yellow-500",
    bgClass: "bg-yellow-500/10",
    disabled: false,
  },
  {
    key: "advanced",
    colorClass: "text-gray-500",
    borderClass: "border-gray-600",
    bgClass: "bg-gray-500/10",
    disabled: true,
  },
];

const TRUST_LEVELS: TrustConfig[] = [
  {
    key: "auto",
    colorClass: "text-blue-400",
    borderClass: "border-blue-500",
    bgClass: "bg-blue-500/10",
  },
  {
    key: "standard",
    colorClass: "text-amber-400",
    borderClass: "border-amber-500",
    bgClass: "bg-amber-500/10",
  },
  {
    key: "collaborative",
    colorClass: "text-emerald-400",
    borderClass: "border-emerald-500",
    bgClass: "bg-emerald-500/10",
  },
];

export function AdvancedSettingsCard() {
  const { t } = useTranslation();
  const [currentMode, setCurrentMode] = useState<ExecutionMode>("simple");
  const [currentTrust, setCurrentTrust] = useState<TrustLevel>("standard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ExecutionMode | null>(null);

  useEffect(() => {
    fetch("/api/settings/preferences")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.preferences) {
          setCurrentMode(json.data.preferences.agentExecutionMode || "simple");
          setCurrentTrust(json.data.preferences.trustLevel || "standard");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveMode = useCallback(
    async (mode: ExecutionMode) => {
      setSaving(true);
      try {
        const res = await fetch("/api/settings/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentExecutionMode: mode }),
        });
        const json = await res.json();
        if (json.success) {
          setCurrentMode(mode);
        }
      } catch (e) {
        console.error("Failed to save execution mode:", e);
      } finally {
        setSaving(false);
        setConfirmModal(null);
      }
    },
    []
  );

  const saveTrust = useCallback(
    async (level: TrustLevel) => {
      if (level === currentTrust) return;
      setSaving(true);
      try {
        const res = await fetch("/api/settings/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trustLevel: level }),
        });
        const json = await res.json();
        if (json.success) {
          setCurrentTrust(level);
        }
      } catch (e) {
        console.error("Failed to save trust level:", e);
      } finally {
        setSaving(false);
      }
    },
    [currentTrust]
  );

  const handleModeClick = useCallback(
    (mode: ExecutionMode) => {
      if (mode === currentMode) return;
      if (mode === "advanced") return;
      if (mode === "medium") {
        setConfirmModal(mode);
        return;
      }
      saveMode(mode);
    },
    [currentMode, saveMode]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Settings2 className="w-6 h-6 text-purple-400" />
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {t("advancedSettings.title")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {t("advancedSettings.description")}
          </p>
        </div>
      </div>

      {/* ── Section 1: Agent Work Mode ── */}
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
        {t("advancedSettings.section.workMode")}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MODES.map((mode) => {
          const isActive = currentMode === mode.key;
          return (
            <button
              key={mode.key}
              disabled={mode.disabled || saving}
              onClick={() => handleModeClick(mode.key)}
              className={clsx(
                "relative rounded-xl border-2 p-5 text-left transition-all",
                isActive
                  ? `${mode.borderClass} ${mode.bgClass}`
                  : "border-[var(--border-subtle)] hover:border-[var(--border-default)]",
                mode.disabled && "opacity-50 cursor-not-allowed",
                !mode.disabled && !isActive && "hover:bg-[var(--bg-elevated)]"
              )}
            >
              {isActive && (
                <div className="absolute top-3 right-3">
                  <Check className={clsx("w-5 h-5", mode.colorClass)} />
                </div>
              )}

              <h3
                className={clsx(
                  "text-sm font-semibold mb-1",
                  isActive ? mode.colorClass : "text-[var(--text-primary)]"
                )}
              >
                {t(`advancedSettings.mode.${mode.key}.title`)}
              </h3>

              <p className="text-xs text-[var(--text-muted)] mb-3">
                {t(`advancedSettings.mode.${mode.key}.description`)}
              </p>

              <div className="space-y-1">
                {(
                  t(`advancedSettings.mode.${mode.key}.features`) as string
                )
                  .split("|")
                  .map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
                    >
                      <span className={clsx("w-1 h-1 rounded-full", isActive ? mode.colorClass.replace("text-", "bg-") : "bg-[var(--bg-elevated)]")} />
                      {feature}
                    </div>
                  ))}
              </div>

              {mode.disabled && (
                <div className="mt-3 text-xs text-[var(--text-muted)] italic">
                  {t("advancedSettings.comingSoon")}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Section 2: Trust Level ── */}
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 mt-8">
        {t("advancedSettings.section.trustLevel")}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TRUST_LEVELS.map((trust) => {
          const isActive = currentTrust === trust.key;
          return (
            <button
              key={trust.key}
              disabled={saving}
              onClick={() => saveTrust(trust.key)}
              className={clsx(
                "relative rounded-xl border-2 p-5 text-left transition-all",
                isActive
                  ? `${trust.borderClass} ${trust.bgClass}`
                  : "border-[var(--border-subtle)] hover:border-[var(--border-default)]",
                !isActive && "hover:bg-[var(--bg-elevated)]"
              )}
            >
              {isActive && (
                <div className="absolute top-3 right-3">
                  <Check className={clsx("w-5 h-5", trust.colorClass)} />
                </div>
              )}

              <h3
                className={clsx(
                  "text-sm font-semibold mb-1",
                  isActive ? trust.colorClass : "text-[var(--text-primary)]"
                )}
              >
                {t(`advancedSettings.trust.${trust.key}.title`)}
              </h3>

              <p className="text-xs text-[var(--text-muted)] mb-3">
                {t(`advancedSettings.trust.${trust.key}.description`)}
              </p>

              <div className="space-y-1">
                {(
                  t(`advancedSettings.trust.${trust.key}.features`) as string
                )
                  .split("|")
                  .map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
                    >
                      <span className={clsx("w-1 h-1 rounded-full", isActive ? trust.colorClass.replace("text-", "bg-") : "bg-[var(--bg-elevated)]")} />
                      {feature}
                    </div>
                  ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Confirm modal for medium mode */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmModal(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-glass)] shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-subtle)]">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("advancedSettings.confirmTitle")}
              </h3>
            </div>

            <div className="px-5 py-4">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {t("advancedSettings.confirmMessage")}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={saving}
                className="px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => saveMode(confirmModal)}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors disabled:opacity-40"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t("advancedSettings.confirmButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
