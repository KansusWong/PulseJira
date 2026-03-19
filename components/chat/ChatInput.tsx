"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Paperclip, Square, ChevronDown, Check, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from '@/lib/i18n';
import { AttachmentPreview } from "./AttachmentPreview";
import type { AttachmentMeta } from "@/lib/core/types";

const THINKING_MODEL_LABEL = process.env.NEXT_PUBLIC_THINKING_MODEL_LABEL || 'GLM-5';

/** Available fast models — shown as selectable options when thinking mode is off. */
const FAST_MODELS: { id: string; label: string; desc: string }[] = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', desc: 'chat.modelSonnetDesc' },
  { id: 'glm-4-flash', label: 'GLM-4-Flash', desc: 'chat.modelFastDesc' },
];

const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv", "text/plain", "text/markdown",
];
const ALLOWED_EXTENSIONS = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.xls,.csv,.txt,.md";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 5;

interface ChatInputProps {
  onSubmit: (text: string, attachments?: AttachmentMeta[]) => void;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  streaming?: boolean;
  executionMode?: string | null;
  conversationId?: string;
  thinkingMode?: boolean;
  onThinkingModeChange?: (enabled: boolean) => void;
  selectedFastModel?: string;
  onFastModelChange?: (modelId: string) => void;
}

export function ChatInput({
  onSubmit,
  onStop,
  placeholder,
  disabled = false,
  streaming = false,
  executionMode,
  conversationId,
  thinkingMode,
  onThinkingModeChange,
  selectedFastModel,
  onFastModelChange,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea (max 6 lines ~144px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [text]);

  // Click outside to close model menu
  useEffect(() => {
    if (!showModelMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelMenu]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // Validate count
    if (pendingFiles.length + fileArray.length > MAX_FILES) {
      alert(t('chat.maxFiles'));
      return;
    }

    // Validate size
    for (const f of fileArray) {
      if (f.size > MAX_FILE_SIZE) {
        alert(`${t('chat.fileTooLarge')}: ${f.name}`);
        return;
      }
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("conversation_id", conversationId || "default");
      for (const f of fileArray) {
        formData.append("files", f);
      }

      const res = await fetch("/api/chat/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (json.success && json.files) {
        setPendingFiles((prev) => [...prev, ...json.files]);
      } else {
        alert(json.error || t('chat.uploadFailed'));
      }
    } catch {
      alert(t('chat.uploadFailed'));
    } finally {
      setUploading(false);
    }
  }, [conversationId, pendingFiles.length, t]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = ""; // reset for re-selection
    }
  }, [uploadFiles]);

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleSubmit = useCallback(() => {
    if ((!text.trim() && pendingFiles.length === 0) || disabled) return;
    onSubmit(text.trim(), pendingFiles.length > 0 ? pendingFiles : undefined);
    setText("");
    setPendingFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, pendingFiles, disabled, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = (text.trim() || pendingFiles.length > 0) && !disabled && !uploading;
  const activeFastModel = FAST_MODELS.find(m => m.id === (selectedFastModel || '')) || FAST_MODELS[0];
  const modelLabel = thinkingMode ? THINKING_MODEL_LABEL : activeFastModel.label;

  return (
    <div className="px-4 py-3">
      <div className="relative max-w-[680px] mx-auto">
        {/* Main input container - glass level 2 */}
        <div className="flex flex-col bg-white/[0.02] backdrop-blur-md border border-[var(--border-default)] rounded-[14px] focus-within:border-[var(--border-focus)] transition-colors">
            {/* Pending attachments */}
            {(pendingFiles.length > 0 || uploading) && (
              <div className="pt-2">
                <AttachmentPreview
                  files={pendingFiles}
                  uploading={uploading}
                  onRemove={removeFile}
                />
              </div>
            )}

            {/* Main input row: [+] [textarea] [model] [send] */}
            <div className="flex items-end gap-2 px-3 py-3">
              {/* Attach button (+) - 32px ghost button */}
              <button
                onClick={handleFileSelect}
                disabled={uploading || streaming}
                className={clsx(
                  "w-8 h-8 flex items-center justify-center transition-colors flex-shrink-0 rounded-lg",
                  uploading || streaming
                    ? "text-[var(--text-disabled)] cursor-not-allowed"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                )}
                title={t('chat.attach')}
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS}
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Textarea - flexible width */}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ?? t('chat.placeholder')}
                disabled={disabled}
                rows={1}
                className="flex-1 bg-transparent text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none min-h-[24px] max-h-[144px] leading-6"
              />

              {/* Model selector dropdown - ghost button with border-subtle
                  On mobile (< 768px): icon only, no label
                  On tablet/desktop: full label with dropdown icon
              */}
              <div ref={modelMenuRef} className="relative flex-shrink-0">
                <button
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 h-8 rounded-lg hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-colors"
                >
                  {/* Mobile: only show icon */}
                  <Sparkles className="w-4 h-4 md:hidden" />
                  {/* Desktop: show label + dropdown icon */}
                  <span className="hidden md:inline">{modelLabel}</span>
                  <ChevronDown className={clsx("w-3 h-3 hidden md:block transition-transform", showModelMenu && "rotate-180")} />
                </button>

                {/* Dropdown menu */}
                {showModelMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden z-50">
                    {/* Fast model options */}
                    {FAST_MODELS.map((fm, idx) => {
                      const isActive = !thinkingMode && (selectedFastModel || '') === fm.id;
                      return (
                        <button
                          key={fm.id || 'default'}
                          onClick={() => {
                            onThinkingModeChange?.(false);
                            onFastModelChange?.(fm.id);
                            setShowModelMenu(false);
                          }}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
                        >
                          <div>
                            <div className="text-sm text-[var(--text-primary)]">{fm.label}</div>
                            <div className="text-xs text-[var(--text-secondary)] mt-0.5">{t(fm.desc)}</div>
                          </div>
                          {isActive && <Check className="w-4 h-4 text-[var(--accent)] flex-shrink-0 ml-3" />}
                        </button>
                      );
                    })}

                    <div className="border-t border-[var(--border-subtle)] mx-3" />

                    {/* Extended thinking toggle */}
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors">
                      <div>
                        <div className="text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          {t('chat.extendedThinking')}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">{t('chat.extendedThinkingDesc')}</div>
                      </div>
                      {/* Toggle switch */}
                      <button
                        onClick={() => onThinkingModeChange?.(!thinkingMode)}
                        className={clsx(
                          "inline-flex items-center w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3 p-0.5",
                          thinkingMode ? "bg-[var(--accent)]" : "bg-[var(--bg-tertiary)]"
                        )}
                      >
                        <span
                          className={clsx(
                            "block w-4 h-4 rounded-full transition-transform shadow-sm",
                            thinkingMode
                              ? "translate-x-[16px] bg-black"
                              : "translate-x-0 bg-[var(--text-disabled)]"
                          )}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit / Stop - 32px button with accent bg */}
              {streaming && !text.trim() ? (
                <button
                  onClick={onStop}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-all flex-shrink-0 bg-red-500/80 text-white hover:bg-red-500"
                  title={t('chat.stopGenerating')}
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canSend}
                  className={clsx(
                    "w-8 h-8 flex items-center justify-center rounded-lg transition-all flex-shrink-0",
                    canSend
                      ? "bg-[var(--accent)] text-black hover:bg-[var(--accent)]/90"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-disabled)]"
                  )}
                  title={streaming ? t('chat.sendWillInterrupt') : undefined}
                >
                  {streaming && text.trim() ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>

        {/* Bottom hint */}
        {executionMode && (
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-[10px] text-[var(--text-muted)]">
              {executionMode.replace("_", " ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
