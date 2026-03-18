"use client";

import { useCallback, useRef } from "react";
import clsx from "clsx";
import { Download, Square } from "lucide-react";
import type { ChatMessage, AttachmentMeta } from "@/lib/core/types";
import { useTranslation } from '@/lib/i18n';
import { usePulseStore } from "@/store/usePulseStore.new";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolUsageSummary } from "./ToolUsageSummary";
import { MessageAttachments } from "./MessageAttachments";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const artifactPanelOpen = usePulseStore((s) => s.artifactPanelOpen);

  const agentName = message.metadata?.agent_name;
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant" || message.role === "agent";
  const isSystem = message.role === "system";
  const isPlan = message.role === "plan";

  const roleLabels: Record<string, string> = {
    user: t('chat.role.user'),
    assistant: '',
    agent: '',
    system: t('chat.role.system'),
    plan: t('chat.role.plan'),
  };

  const handleExport = useCallback(() => {
    const blob = new Blob([message.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rebuild-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [message.content]);

  const showExport = message.role === 'assistant' && message.metadata?.exportable === true;
  const wasStopped = message.metadata?.stopped === true;
  const attachments = (message.metadata?.attachments as AttachmentMeta[] | undefined) ?? [];

  // Tool usage summary
  const toolSteps = message.metadata?.toolSteps;
  const showToolSummary = isAssistant && toolSteps?.length > 0;

  const displayLabel = agentName
    ? `${roleLabels[message.role] || ''} (${agentName})`
    : roleLabels[message.role] || '';

  // ── User message ──
  if (isUser) {
    return (
      <div
        ref={bubbleRef}
        className={clsx(
          "w-fit ml-auto",
          artifactPanelOpen ? "max-w-[85%]" : "max-w-[80%]",
        )}
      >
        {displayLabel && (
          <div className="mb-1 px-1 text-right">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              {displayLabel}
            </span>
          </div>
        )}
        <div className="bg-[var(--bg-glass)] border border-[var(--border-subtle)] rounded-[16px] rounded-br-[4px] px-4 py-3 text-[var(--text-primary)]">
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </div>
          {attachments.length > 0 && (
            <MessageAttachments attachments={attachments} />
          )}
        </div>
      </div>
    );
  }

  // ── Assistant / Agent message ──
  if (isAssistant) {
    return (
      <div
        ref={bubbleRef}
        className="max-w-[85%] w-fit mr-auto"
      >
        <div className="flex gap-3">
          {/* Avatar: 28px amber square */}
          <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0 mt-0.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 text-[var(--text-secondary)] leading-[1.7] [&_strong]:text-[var(--text-primary)]">
            <MarkdownRenderer content={message.content} />

            {attachments.length > 0 && (
              <MessageAttachments attachments={attachments} />
            )}

            {wasStopped && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[var(--border-subtle)]">
                <Square className="w-3 h-3 text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)]">{t('chat.generationStopped')}</span>
              </div>
            )}

            {showToolSummary && (
              <ToolUsageSummary items={toolSteps} />
            )}

            {showExport && (
              <div className="border-t border-[var(--border-subtle)] mt-3 pt-2 flex justify-end">
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors px-2 py-1 rounded-md hover:bg-[var(--bg-glass)]"
                >
                  <Download size={14} />
                  {t('chat.exportMarkdown')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── System / Plan / other roles ──
  return (
    <div
      ref={bubbleRef}
      className={clsx(
        "max-w-[85%] w-fit",
        isSystem && "mx-auto",
        isPlan && "mr-auto",
        !isSystem && !isPlan && "mr-auto",
      )}
    >
      {displayLabel && (
        <div className="mb-1 px-1">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            {displayLabel}
          </span>
        </div>
      )}
      <div className={clsx(
        "px-3 py-2 rounded-lg",
        isSystem && "bg-amber-500/5 text-amber-200/80",
        isPlan && "bg-cyan-500/5 text-cyan-200/80",
        !isSystem && !isPlan && "text-[var(--text-secondary)]",
      )}>
        <MarkdownRenderer content={message.content} />

        {attachments.length > 0 && (
          <MessageAttachments attachments={attachments} />
        )}
      </div>
    </div>
  );
}
