"use client";

import { useCallback, useRef } from "react";
import clsx from "clsx";
import { Download, Square } from "lucide-react";
import type { ChatMessage, AttachmentMeta } from "@/lib/core/types";
import { useTranslation } from '@/lib/i18n';
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolUsageSummary } from "./ToolUsageSummary";
import { MessageAttachments } from "./MessageAttachments";

const roleStyles: Record<string, { bg: string; text: string; label: string; align: string }> = {
  user: {
    bg: "bg-zinc-800/80 rounded-2xl",
    text: "text-zinc-100",
    label: "You",
    align: "ml-auto",
  },
  assistant: {
    bg: "",
    text: "text-zinc-300",
    label: "",
    align: "mr-auto",
  },
  agent: {
    bg: "",
    text: "text-zinc-300",
    label: "",
    align: "mr-auto",
  },
  system: {
    bg: "bg-amber-500/5 rounded-lg",
    text: "text-amber-200/80",
    label: "System",
    align: "mx-auto",
  },
  plan: {
    bg: "bg-cyan-500/5 rounded-lg",
    text: "text-cyan-200/80",
    label: "Plan",
    align: "mr-auto",
  },
};

const defaultStyle = roleStyles.assistant;

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation();
  const style = roleStyles[message.role] || defaultStyle;
  const agentName = message.metadata?.agent_name;
  const bubbleRef = useRef<HTMLDivElement>(null);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant" || message.role === "agent";

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
    ? `${roleLabels[message.role] || style.label} (${agentName})`
    : roleLabels[message.role] || style.label;

  return (
    <div
      ref={bubbleRef}
      className={clsx("max-w-[85%] w-fit", style.align)}
    >
      {/* Label — only for roles with a label */}
      {displayLabel && (
        <div className="mb-1 px-1">
          <span className="text-[11px] font-medium text-zinc-500">
            {displayLabel}
          </span>
        </div>
      )}

      {/* Bubble */}
      <div className={clsx(
        isUser ? "rounded-2xl px-4 py-3" : "px-1 py-1",
        style.bg,
        style.text,
      )}>
        {isUser ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {attachments.length > 0 && (
          <MessageAttachments attachments={attachments} />
        )}

        {wasStopped && (
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-800/30">
            <Square className="w-3 h-3 text-zinc-500" />
            <span className="text-xs text-zinc-500">{t('chat.generationStopped')}</span>
          </div>
        )}

        {showToolSummary && (
          <ToolUsageSummary items={toolSteps} />
        )}

        {showExport && (
          <div className="border-t border-zinc-800/30 mt-3 pt-2 flex justify-end">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded-md hover:bg-zinc-800/60"
            >
              <Download size={14} />
              {t('chat.exportMarkdown')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
