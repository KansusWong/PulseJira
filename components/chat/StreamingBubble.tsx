"use client";

import { useCallback, useState } from "react";
import { Loader2, Check, X, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";
import type { StreamingSection } from "@/store/slices/chatSlice";
import { usePulseStore } from "@/store/usePulseStore.new";
import { useTranslation } from "@/lib/i18n";
import { MarkdownRenderer } from "./MarkdownRenderer";

export function StreamingBubble({ sections }: { sections: StreamingSection[] }) {
  if (sections.length === 0) return null;
  return (
    <div className="mr-auto max-w-[85%]">
      <div className="flex gap-3">
        {/* Avatar: 28px amber square — matches MessageBubble assistant style */}
        <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 text-[var(--text-secondary)] leading-[1.7] [&_strong]:text-[var(--text-primary)]">
          {sections.map((section, i) => (
            <StreamingSectionView
              key={i}
              section={section}
              isLast={i === sections.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StreamingSectionView({
  section,
  isLast,
}: {
  section: StreamingSection;
  isLast: boolean;
}) {
  if (section.type === "text") {
    return (
      <div className="relative">
        <MarkdownRenderer content={section.content} isStreaming />
        {isLast && (
          <span className="inline-block w-[2px] h-4 bg-[var(--accent)] animate-[blink_1s_step-end_infinite] ml-0.5 align-text-bottom absolute bottom-1" />
        )}
      </div>
    );
  }

  // tool_call — minimal inline indicator + optional approval card
  return (
    <div className="my-1.5 py-1 px-2">
      <div className="flex items-center gap-2 text-xs">
        {section.status === "running" && (
          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
        )}
        {section.status === "success" && (
          <Check className="w-3 h-3 text-emerald-500/70" />
        )}
        {section.status === "error" && (
          <X className="w-3 h-3 text-red-400/70" />
        )}
        <span className="text-[var(--text-muted)] font-medium">{section.toolLabel}</span>
        {section.args && (
          <span className="text-[var(--text-muted)] opacity-60 truncate max-w-[250px]">
            {section.args}
          </span>
        )}
      </div>
      {section.resultPreview && (
        <div className="mt-0.5 text-[11px] text-[var(--text-muted)] opacity-60 truncate pl-5">
          {section.resultPreview}
        </div>
      )}

      {/* Inline tool approval card */}
      {section.status === "running" && (
        <InlineToolApproval toolName={section.toolName} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline approval card — renders only when this tool has a pending approval
// ---------------------------------------------------------------------------

function InlineToolApproval({ toolName }: { toolName: string }) {
  const { t } = useTranslation();
  const panel = usePulseStore((s) => s.toolApprovalPanel);
  const approveToolExecution = usePulseStore((s) => s.approveToolExecution);
  const rejectToolExecution = usePulseStore((s) => s.rejectToolExecution);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);

  const [argsExpanded, setArgsExpanded] = useState(false);

  const handleApprove = useCallback(async () => {
    if (!activeConversationId || !panel.approvalId) return;
    approveToolExecution();
    try {
      await fetch(`/api/conversations/${activeConversationId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_tool",
          approval_id: panel.approvalId,
        }),
      });
    } catch { /* handled by SSE */ }
  }, [activeConversationId, panel.approvalId, approveToolExecution]);

  const handleReject = useCallback(async () => {
    if (!activeConversationId || !panel.approvalId) return;
    rejectToolExecution();
    try {
      await fetch(`/api/conversations/${activeConversationId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_tool",
          approval_id: panel.approvalId,
        }),
      });
    } catch { /* handled by SSE */ }
  }, [activeConversationId, panel.approvalId, rejectToolExecution]);

  // Only show when this tool has a pending approval
  if (!panel.visible || panel.toolName !== toolName) return null;

  const isResolved = panel.status === "approved" || panel.status === "rejected";

  // Brief post-action feedback
  if (isResolved) {
    return (
      <div className="mt-2 ml-5 text-xs">
        {panel.status === "approved" && (
          <span className="text-emerald-400">{t("toolApproval.approved")}</span>
        )}
        {panel.status === "rejected" && (
          <span className="text-[var(--text-muted)]">{t("toolApproval.rejected")}</span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-xs font-medium text-amber-400">
          {t("toolApproval.title")}
        </span>
      </div>

      {/* Collapsible arguments */}
      {panel.toolArgs && (
        <div className="px-3 pb-2">
          <button
            onClick={() => setArgsExpanded(!argsExpanded)}
            className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {argsExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {t("toolApproval.arguments")}
          </button>
          {argsExpanded && (
            <pre className="mt-1 text-[11px] text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded-md p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-words">
              {JSON.stringify(panel.toolArgs, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Warning + action buttons */}
      <div className="px-3 pb-2.5">
        <p className="text-[11px] text-amber-400/60 mb-2">
          {t("toolApproval.warning")}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleApprove}
            className="flex-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
          >
            {t("toolApproval.approve")}
          </button>
          <button
            onClick={handleReject}
            className="flex-1 px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-glass)] text-[var(--text-secondary)] text-xs font-medium transition-colors"
          >
            {t("toolApproval.reject")}
          </button>
        </div>
      </div>
    </div>
  );
}
