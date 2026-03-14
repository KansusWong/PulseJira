"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Bell,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  Pencil,
  FileText,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

interface WebhookConfig {
  id: string;
  provider: string;
  label: string;
  webhook_url: string;
  events: string[];
  active: boolean;
  message_template: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

const PROVIDERS = ["feishu", "dingtalk", "slack", "wecom", "custom"] as const;
const ALL_EVENTS = [
  "pipeline_complete",
  "deploy_complete",
  "deploy_failed",
  "pr_created",
  "daily_report_complete",
] as const;

const providerIcons: Record<string, string> = {
  feishu: "🔵",
  dingtalk: "🔶",
  slack: "💬",
  wecom: "🟢",
  custom: "🔗",
};

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (path.length > 20) {
      return `${u.origin}${path.slice(0, 12)}...${path.slice(-6)}`;
    }
    return `${u.origin}${path}`;
  } catch {
    if (url.length > 40) return `${url.slice(0, 20)}...${url.slice(-10)}`;
    return url;
  }
}

export function WebhookConfigCard() {
  const { t, locale } = useTranslation();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formProvider, setFormProvider] = useState<string>("feishu");
  const [formLabel, setFormLabel] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([
    "pipeline_complete",
    "deploy_complete",
    "deploy_failed",
  ]);
  const [formTemplate, setFormTemplate] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit template state
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTemplateValue, setEditTemplateValue] = useState("");
  const [editDisplayNameValue, setEditDisplayNameValue] = useState("");
  const [editEventsValue, setEditEventsValue] = useState<string[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Delete confirm state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Per-webhook daily report trigger state
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportResult, setReportResult] = useState<{
    id: string;
    ok: boolean;
    message: string;
  } | null>(null);

  // Test / delete state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    message: string;
  } | null>(null);

  const fetchWebhooks = useCallback(() => {
    setLoading(true);
    fetch("/api/settings/webhooks?limit=200")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setWebhooks(json.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleCreate = useCallback(async () => {
    if (!formUrl.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/settings/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: formProvider,
          label: formLabel.trim(),
          webhook_url: formUrl.trim(),
          events: formEvents,
          message_template: formTemplate.trim() || null,
          display_name: formDisplayName.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowForm(false);
        setFormLabel("");
        setFormUrl("");
        setFormEvents(["pipeline_complete", "deploy_complete", "deploy_failed"]);
        setFormTemplate("");
        setFormDisplayName("");
        fetchWebhooks();
      }
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  }, [formProvider, formLabel, formUrl, formEvents, formTemplate, formDisplayName, fetchWebhooks]);

  const handleToggleActive = useCallback(
    async (id: string, active: boolean) => {
      await fetch(`/api/settings/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      fetchWebhooks();
    },
    [fetchWebhooks],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await fetch(`/api/settings/webhooks/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      fetchWebhooks();
    },
    [fetchWebhooks],
  );

  const handleTest = useCallback(
    async (id: string) => {
      setTestingId(id);
      setTestResult(null);
      try {
        const res = await fetch("/api/settings/webhooks/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webhook_id: id }),
        });
        const json = await res.json();
        setTestResult({
          id,
          ok: json.success,
          message: json.success ? t("webhook.testSuccess") : (json.error || t("webhook.testFailed")),
        });
      } catch {
        setTestResult({ id, ok: false, message: t("webhook.testFailed") });
      } finally {
        setTestingId(null);
      }
    },
    [t],
  );

  const handleSaveTemplate = useCallback(
    async (id: string) => {
      setSavingTemplate(true);
      try {
        await fetch(`/api/settings/webhooks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_template: editTemplateValue.trim() || null,
            display_name: editDisplayNameValue.trim() || null,
            events: editEventsValue,
          }),
        });
        setEditingTemplateId(null);
        fetchWebhooks();
      } catch {
        // silently fail
      } finally {
        setSavingTemplate(false);
      }
    },
    [editTemplateValue, editDisplayNameValue, editEventsValue, fetchWebhooks],
  );

  const handleTriggerDailyReport = useCallback(
    async (webhookId: string) => {
      setReportingId(webhookId);
      setReportResult(null);
      try {
        const res = await fetch("/api/cron/daily-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webhook_id: webhookId, locale }),
        });
        const json = await res.json();
        if (json.success) {
          const mode = json.data?.mode;
          if (mode === "completed") {
            setReportResult({ id: webhookId, ok: true, message: t("webhook.dailyReportSuccess") });
          } else if (mode === "skipped") {
            setReportResult({ id: webhookId, ok: true, message: t("webhook.dailyReportSkipped") });
          } else if (mode === "disabled") {
            setReportResult({ id: webhookId, ok: false, message: t("webhook.dailyReportDisabled") });
          } else {
            setReportResult({ id: webhookId, ok: true, message: mode });
          }
        } else {
          setReportResult({ id: webhookId, ok: false, message: json.error || t("webhook.dailyReportFailed") });
        }
      } catch {
        setReportResult({ id: webhookId, ok: false, message: t("webhook.dailyReportFailed") });
      } finally {
        setReportingId(null);
      }
    },
    [t, locale],
  );

  const toggleEvent = (event: string) => {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-amber-400" />
          <div>
            <h2 className="text-lg font-bold text-zinc-100">
              {t("webhook.title")}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {t("webhook.description")}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("webhook.add")}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-zinc-700/60 bg-zinc-900/80 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={formProvider}
              onChange={(e) => setFormProvider(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {providerIcons[p]} {t(`webhook.${p}`)}
                </option>
              ))}
            </select>
            <input
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              placeholder={t("webhook.provider")}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <input
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            placeholder={t("webhook.url")}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
          />
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              {t("webhook.displayName")}
            </label>
            <input
              value={formDisplayName}
              onChange={(e) => setFormDisplayName(e.target.value)}
              placeholder={t("webhook.displayNamePlaceholder")}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              {t("webhook.displayNameHint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((event) => (
              <button
                key={event}
                onClick={() => toggleEvent(event)}
                className={clsx(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors",
                  formEvents.includes(event)
                    ? "border-amber-500/60 bg-amber-500/20 text-amber-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {t(`webhook.event.${event}`)}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              {t("webhook.messageTemplate")}
            </label>
            <textarea
              value={formTemplate}
              onChange={(e) => setFormTemplate(e.target.value)}
              placeholder={t("webhook.templatePlaceholder")}
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono resize-none"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              {t("webhook.templateHint")}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !formUrl.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {creating ? t("common.creating") : t("common.create")}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-16 text-zinc-600 text-sm">
          {t("common.noData")}
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-colors"
            >
              {/* Provider icon */}
              <span className="text-xl flex-shrink-0">
                {providerIcons[wh.provider] || "🔗"}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">
                    {wh.label || t(`webhook.${wh.provider}`)}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">
                    {wh.provider}
                  </span>
                  {wh.display_name && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                      {wh.display_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                  {maskUrl(wh.webhook_url)}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {wh.events.map((ev) => (
                    <span
                      key={ev}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400"
                    >
                      {t(`webhook.event.${ev}`)}
                    </span>
                  ))}
                </div>
                {/* Template summary or inline editor */}
                {editingTemplateId === wh.id ? (
                  <div className="mt-2 space-y-1.5">
                    <div>
                      <label className="block text-[10px] text-zinc-500 mb-0.5">
                        {t("webhook.displayName")}
                      </label>
                      <input
                        value={editDisplayNameValue}
                        onChange={(e) => setEditDisplayNameValue(e.target.value)}
                        placeholder={t("webhook.displayNamePlaceholder")}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_EVENTS.map((ev) => (
                        <button
                          key={ev}
                          onClick={() =>
                            setEditEventsValue((prev) =>
                              prev.includes(ev)
                                ? prev.filter((e) => e !== ev)
                                : [...prev, ev],
                            )
                          }
                          className={clsx(
                            "px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                            editEventsValue.includes(ev)
                              ? "border-amber-500/60 bg-amber-500/20 text-amber-300"
                              : "border-zinc-700 text-zinc-500 hover:text-zinc-300",
                          )}
                        >
                          {t(`webhook.event.${ev}`)}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={editTemplateValue}
                      onChange={(e) => setEditTemplateValue(e.target.value)}
                      placeholder={t("webhook.templatePlaceholder")}
                      rows={2}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono resize-none"
                    />
                    <p className="text-[10px] text-zinc-600">
                      {t("webhook.templateHint")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveTemplate(wh.id)}
                        disabled={savingTemplate}
                        className="px-2 py-1 text-[10px] font-medium rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-40"
                      >
                        {savingTemplate ? t("common.saving") : t("common.save")}
                      </button>
                      <button
                        onClick={() => setEditingTemplateId(null)}
                        className="px-2 py-1 text-[10px] rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : wh.message_template ? (
                  <p className="text-[10px] text-zinc-500 font-mono mt-1 truncate">
                    {t("webhook.templateLabel")}: {wh.message_template}
                  </p>
                ) : null}
              </div>

              {/* Test / Report result */}
              {testResult?.id === wh.id && (
                <div className="flex items-center gap-1">
                  {testResult.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span
                    className={clsx(
                      "text-xs",
                      testResult.ok ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {testResult.message}
                  </span>
                </div>
              )}
              {reportResult?.id === wh.id && (
                <div className="flex items-center gap-1">
                  {reportResult.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span
                    className={clsx(
                      "text-xs",
                      reportResult.ok ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {reportResult.message}
                  </span>
                </div>
              )}

              {/* Active toggle */}
              <button
                onClick={() => handleToggleActive(wh.id, !wh.active)}
                className={clsx(
                  "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
                  wh.active ? "bg-emerald-500/60" : "bg-zinc-700",
                )}
              >
                <span
                  className={clsx(
                    "absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    wh.active ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>

              {/* Edit template button */}
              <button
                onClick={() => {
                  if (editingTemplateId === wh.id) {
                    setEditingTemplateId(null);
                  } else {
                    setEditTemplateValue(wh.message_template || "");
                    setEditDisplayNameValue(wh.display_name || "");
                    setEditEventsValue([...wh.events]);
                    setEditingTemplateId(wh.id);
                  }
                }}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title={t("webhook.edit")}
              >
                <Pencil className="w-4 h-4" />
              </button>

              {/* Daily report button */}
              <button
                onClick={() => handleTriggerDailyReport(wh.id)}
                disabled={reportingId === wh.id}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
                title={t("webhook.triggerDailyReport")}
              >
                {reportingId === wh.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
              </button>

              {/* Test button */}
              <button
                onClick={() => handleTest(wh.id)}
                disabled={testingId === wh.id}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                title={t("webhook.test")}
              >
                {testingId === wh.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>

              {/* Delete button */}
              <button
                onClick={() => setDeleteConfirmId(wh.id)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title={t("webhook.delete")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Delete confirm modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-500/10">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">
                {t("webhook.delete")}
              </h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              {t("webhook.deleteConfirm")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                {t("webhook.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
