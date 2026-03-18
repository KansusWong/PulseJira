"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePulseStore } from "@/store/usePulseStore.new";
import {
  X,
  CheckCircle2,
  ArrowLeft,
  Shield,
  Target,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { processSSEResponse } from "@/lib/utils/sse-stream";
import { DmReviewDrawer } from "@/components/project/DmReviewDrawer";

export function ClarificationForm() {
  const requirements = usePulseStore((s) => s.clarificationPanel.requirements);
  const hideClarificationForm = usePulseStore((s) => s.hideClarificationForm);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const addProject = usePulseStore((s) => s.addProject);
  const setRunning = usePulseStore((s) => s.setRunning);
  const setStreaming = usePulseStore((s) => s.setStreaming);

  const router = useRouter();
  const { t } = useTranslation();
  const [projectName, setProjectName] = useState(
    requirements?.suggested_name || ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dmDrawerOpen, setDmDrawerOpen] = useState(false);

  if (!requirements) return null;

  const handleConfirm = async () => {
    if (!activeConversationId) return;
    setIsSubmitting(true);
    setStreaming(true);
    hideClarificationForm();

    try {
      const res = await fetch(
        `/api/conversations/${activeConversationId}/plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "confirm_requirements",
            requirements: {
              ...requirements,
              suggested_name: projectName || requirements.suggested_name,
            },
          }),
        }
      );

      await processSSEResponse(res, activeConversationId, {
        onProjectCreated: (data) => {
          addProject({
            id: data.project_id,
            name: data.name,
            description: '',
            status: 'analyzing',
            is_light: data.is_light,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          setRunning(true, data.project_id);
          // Don't navigate mid-stream — let the user decide when to visit
        },
      });
    } catch (err: any) {
      console.error('[ClarificationForm] Confirm failed:', err);
    } finally {
      setIsSubmitting(false);
      setStreaming(false);
    }
  };

  const handleGoBack = () => {
    hideClarificationForm();
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("clarification.title")}
        </h3>
        <button
          onClick={hideClarificationForm}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Summary */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {t("clarification.summary")}
            </span>
          </div>
          <p className="text-sm text-[var(--text-primary)]">{requirements.summary}</p>
        </div>

        {/* Goals */}
        {requirements.goals.length > 0 && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-[var(--text-secondary)]" />
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                {t("clarification.goals")}
              </span>
            </div>
            <ul className="space-y-1.5">
              {requirements.goals.map((goal, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"
                >
                  <span className="flex-shrink-0 w-1.5 h-1.5 mt-1.5 rounded-full bg-emerald-500/60" />
                  {goal}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Scope */}
        {requirements.scope && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
              {t("clarification.scope")}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">{requirements.scope}</p>
          </div>
        )}

        {/* Constraints */}
        {requirements.constraints.length > 0 && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400/60" />
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                {t("clarification.constraints")}
              </span>
            </div>
            <ul className="space-y-1.5">
              {requirements.constraints.map((c, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"
                >
                  <span className="flex-shrink-0 w-1.5 h-1.5 mt-1.5 rounded-full bg-amber-500/60" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Project Name (editable) */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2 block">
            {t("clarification.projectName")}
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)]"
            placeholder="project-name"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 px-4 py-3 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isSubmitting ? t("common.creating") : t("clarification.confirm")}
          </button>
          <button
            onClick={handleGoBack}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("clarification.goBack")}
          </button>
        </div>
        {activeConversationId && (
          <button
            onClick={() => setDmDrawerOpen(true)}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 border border-blue-500/20 transition-colors disabled:opacity-50"
          >
            <Shield className="w-4 h-4" />
            {t("dm.drawerTitle")}
          </button>
        )}
      </div>

      {dmDrawerOpen && activeConversationId && (
        <DmReviewDrawer
          conversationId={activeConversationId}
          requirements={requirements}
          onClose={() => setDmDrawerOpen(false)}
        />
      )}
    </div>
  );
}
