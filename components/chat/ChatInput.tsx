"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Slash, Square } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from '@/lib/i18n';

interface ChatInputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  streaming?: boolean;
  executionMode?: string | null;
}

export function ChatInput({
  onSubmit,
  placeholder,
  disabled = false,
  streaming = false,
  executionMode,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const handleSubmit = useCallback(() => {
    if (!text.trim() || disabled) return;
    onSubmit(text.trim());
    setText("");
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="relative max-w-3xl mx-auto">
        <div className="flex items-end gap-2 bg-zinc-900/80 border border-zinc-800 rounded-2xl px-4 py-3 focus-within:border-zinc-600 transition-colors">
          {/* Slash command hint */}
          <button
            className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0 mb-0.5"
            title={t('chat.commands')}
          >
            <Slash className="w-4 h-4" />
          </button>

          {/* Input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? t('chat.placeholder')}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none min-h-[24px] max-h-[200px]"
          />

          {/* Mode indicator */}
          {executionMode && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 flex-shrink-0 mb-0.5">
              {executionMode.replace("_", " ")}
            </span>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className={clsx(
              "p-1.5 rounded-lg transition-all flex-shrink-0 mb-0.5",
              text.trim() && !disabled
                ? streaming
                  ? "bg-amber-500 text-zinc-900 hover:bg-amber-400"
                  : "bg-zinc-100 text-zinc-900 hover:bg-white"
                : "bg-zinc-800 text-zinc-600"
            )}
            title={streaming ? t('chat.sendWillInterrupt') : undefined}
          >
            {streaming && text.trim() ? (
              <Square className="w-3.5 h-3.5" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Bottom hint */}
        <div className="flex items-center justify-center gap-4 mt-2">
          <span className="text-[10px] text-zinc-700">
            {streaming ? t('chat.sendWillInterrupt') : t('chat.enterToSend')}
          </span>
          {executionMode && (
            <span className="text-[10px] text-zinc-700">
              {t('chat.signalSummary')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
