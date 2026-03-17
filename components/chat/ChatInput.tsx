"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from '@/lib/i18n';
import { ContextWindowIndicator } from "./ContextWindowIndicator";
import { AttachmentPreview } from "./AttachmentPreview";
import type { AttachmentMeta } from "@/lib/core/types";

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
  contextUsage?: { estimated: number; max: number; ratio: number } | null;
  conversationId?: string;
}

export function ChatInput({
  onSubmit,
  onStop,
  placeholder,
  disabled = false,
  streaming = false,
  executionMode,
  contextUsage,
  conversationId,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

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

  return (
    <div className="px-4 py-3">
      <div className="relative max-w-3xl mx-auto">
        <div className="flex items-center gap-2">
          {/* Main input container */}
          <div className="flex-1 flex flex-col bg-zinc-900/80 border border-zinc-800 rounded-2xl focus-within:border-zinc-600 transition-colors">
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

            {/* Input row */}
            <div className="flex items-end gap-2 px-4 py-3">
              {/* Attach button */}
              <button
                onClick={handleFileSelect}
                disabled={uploading || streaming}
                className={clsx(
                  "p-1 transition-colors flex-shrink-0 mb-0.5",
                  uploading || streaming
                    ? "text-zinc-700 cursor-not-allowed"
                    : "text-zinc-600 hover:text-zinc-400"
                )}
                title={t('chat.attach')}
              >
                <Paperclip className="w-4 h-4" />
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

              {/* Submit / Stop */}
              {streaming && !text.trim() ? (
                <button
                  onClick={onStop}
                  className="p-1.5 rounded-lg transition-all flex-shrink-0 mb-0.5 bg-red-500/80 text-white hover:bg-red-500"
                  title={t('chat.stopGenerating')}
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canSend}
                  className={clsx(
                    "p-1.5 rounded-lg transition-all flex-shrink-0 mb-0.5",
                    canSend
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
              )}
            </div>
          </div>

          {/* Context window battery indicator */}
          {contextUsage && (
            <div className="flex-shrink-0">
              <ContextWindowIndicator
                ratio={contextUsage.ratio}
                estimated={contextUsage.estimated}
                max={contextUsage.max}
              />
            </div>
          )}
        </div>

        {/* Bottom hint */}
        <div className="flex items-center justify-center gap-4 mt-2">
          <span className="text-[10px] text-zinc-700">
            {streaming ? t('chat.clickToStop') : t('chat.enterToSend')}
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
