"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePulseStore } from "@/store/usePulseStore.new";
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Zap,
  Users,
  Loader2,
  MinusCircle,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from '@/lib/i18n';
import { processSSEResponse } from "@/lib/utils/sse-stream";
import { DmReviewDrawer } from "@/components/project/DmReviewDrawer";
import type { PlanStepStatus } from "@/store/slices/chatSlice";

const modeIcons: Record<string, React.ReactNode> = {
  direct: <Zap className="w-4 h-4" />,
  single_agent: <Zap className="w-4 h-4" />,
  agent_team: <Users className="w-4 h-4" />,
};

const modeLabels: Record<string, string> = {
  direct: "Direct",
  single_agent: "Single Agent",
  agent_team: "Agent Team",
};

const complexityColors: Record<string, string> = {
  L1: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  L2: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  L3: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

export function PlanPanel() {
  const assessment = usePulseStore((s) => s.planPanel.assessment);
  const status = usePulseStore((s) => s.planPanel.status);
  const stepStates = usePulseStore((s) => s.planPanel.stepStates);
  const hidePlanPanel = usePulseStore((s) => s.hidePlanPanel);
  const approvePlan = usePulseStore((s) => s.approvePlan);
  const rejectPlan = usePulseStore((s) => s.rejectPlan);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const addProject = usePulseStore((s) => s.addProject);
  const setRunning = usePulseStore((s) => s.setRunning);
  const setStreaming = usePulseStore((s) => s.setStreaming);

  const router = useRouter();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dmDrawerOpen, setDmDrawerOpen] = useState(false);

  if (!assessment) return null;

  const handleApprove = async () => {
    if (isSubmitting) return;
    if (!activeConversationId) return;
    setIsSubmitting(true);
    approvePlan();
    setStreaming(true);
    try {
      const res = await fetch(`/api/conversations/${activeConversationId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
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
          router.push(`/projects/${data.project_id}`);
        },
      });
    } catch {
      // Don't update state — user can retry
    } finally {
      setStreaming(false);
      setIsSubmitting(false);
    }
  };

  const handleReject = () => {
    rejectPlan();
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <h3 className="text-sm font-semibold text-zinc-200">{t('plan.title')}</h3>
        <button
          onClick={hidePlanPanel}
          className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Complexity Card */}
        <div className={clsx("rounded-xl border p-4", complexityColors[assessment.complexity_level] || complexityColors.L1)}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium capitalize">
              {t('plan.complexity', { level: assessment.complexity_level })}
            </span>
          </div>
          <p className="text-xs opacity-80">{assessment.rationale}</p>
        </div>

        {/* Execution Mode */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            {modeIcons[assessment.execution_mode]}
            <span className="text-sm font-medium text-zinc-200">
              {modeLabels[assessment.execution_mode] || assessment.execution_mode}
            </span>
          </div>

          {/* Suggested Agents */}
          {assessment.suggested_agents.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">
                {t('plan.agents')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {assessment.suggested_agents.map((agent) => (
                  <span
                    key={agent}
                    className="px-2 py-0.5 text-[11px] rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                  >
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Estimated Steps */}
          <div className="text-xs text-zinc-500">
            {t('plan.estimatedSteps')} <span className="text-zinc-300">{assessment.estimated_steps}</span>
          </div>
        </div>

        {/* Plan Outline */}
        {assessment.plan_outline.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-3">
              {t('plan.executionPlan')}
            </div>
            <div className="space-y-2">
              {assessment.plan_outline.map((step, i) => {
                const stepState = stepStates[i]?.status ?? 'pending';
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <StepIndicator index={i} status={stepState} />
                    <div className="flex-1 min-w-0">
                      <span
                        className={clsx("text-xs pt-0.5 block", {
                          "text-zinc-400": stepState === "pending",
                          "text-blue-300 font-medium": stepState === "active",
                          "text-emerald-300/80 line-through": stepState === "completed",
                          "text-zinc-600 line-through": stepState === "skipped",
                        })}
                      >
                        {step}
                      </span>
                      {(stepState === "completed" || stepState === "skipped") && stepStates[i]?.summary && (
                        <span className="text-[10px] text-zinc-600 block mt-0.5">
                          {stepStates[i].summary}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Project Conversion Notice */}
        {assessment.requires_project && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-xs text-cyan-300">
              {t('plan.projectNotice')}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {status === "pending" && (
        <div className="flex flex-col gap-2 px-4 py-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {t('plan.approve')}
            </button>
            <button
              onClick={handleReject}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" />
              {t('plan.reject')}
            </button>
          </div>
          {activeConversationId && (
            <button
              onClick={() => setDmDrawerOpen(true)}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 border border-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Shield className="w-4 h-4" />
              {t('dm.drawerTitle')}
            </button>
          )}
        </div>
      )}

      {status === "approved" && (
        <div className="px-4 py-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('plan.approved')}
          </div>
        </div>
      )}

      {dmDrawerOpen && activeConversationId && (
        <DmReviewDrawer conversationId={activeConversationId} onClose={() => setDmDrawerOpen(false)} />
      )}
    </div>
  );
}

function StepIndicator({ index, status }: { index: number; status: PlanStepStatus }) {
  switch (status) {
    case "active":
      return (
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
        </span>
      );
    case "completed":
      return (
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </span>
      );
    case "skipped":
      return (
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          <MinusCircle className="w-4 h-4 text-zinc-600" />
        </span>
      );
    default:
      return (
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 text-[10px] flex items-center justify-center font-mono">
          {index + 1}
        </span>
      );
  }
}
