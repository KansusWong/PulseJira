"use client";

import { useCallback } from "react";
import clsx from "clsx";
import { Download } from "lucide-react";
import type { ChatMessage } from "@/lib/core/types";
import { useTranslation } from '@/lib/i18n';
import { MarkdownRenderer } from "./MarkdownRenderer";

const roleStyles: Record<string, { bg: string; text: string; label: string; align: string }> = {
  user: {
    bg: "bg-zinc-800",
    text: "text-zinc-100",
    label: "You",
    align: "ml-auto",
  },
  assistant: {
    bg: "bg-zinc-900/60 border border-zinc-800/50",
    text: "text-zinc-200",
    label: "RebuilD",
    align: "mr-auto",
  },
  agent: {
    bg: "bg-indigo-500/10 border border-indigo-500/20",
    text: "text-indigo-200",
    label: "Agent",
    align: "mr-auto",
  },
  system: {
    bg: "bg-amber-500/10 border border-amber-500/20",
    text: "text-amber-200",
    label: "System",
    align: "mx-auto",
  },
  plan: {
    bg: "bg-cyan-500/10 border border-cyan-500/20",
    text: "text-cyan-200",
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

  const roleLabels: Record<string, string> = {
    user: t('chat.role.user'),
    assistant: 'RebuilD',
    agent: t('chat.role.agent'),
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

  return (
    <div className={clsx("max-w-[85%] w-fit", style.align)}>
      {/* Label */}
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="text-[11px] font-medium text-zinc-500">
          {agentName ? `${roleLabels[message.role] || style.label} (${agentName})` : roleLabels[message.role] || style.label}
        </span>
        <span className="text-[10px] text-zinc-700">
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Bubble */}
      <div className={clsx("rounded-2xl px-4 py-3", style.bg, style.text)}>
        {message.role === "user" ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {showExport && (
          <>
            <div className="border-t border-zinc-700/50 mt-3 pt-2 flex justify-end">
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded-md hover:bg-zinc-800/60"
              >
                <Download size={14} />
                {t('chat.exportMarkdown')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
