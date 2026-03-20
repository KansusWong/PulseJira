"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ArrowUp, Paperclip, Square, ChevronDown, Check, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from '@/lib/i18n';
import { AttachmentPreview } from "./AttachmentPreview";
import type { AttachmentMeta } from "@/lib/core/types";
import type { AgentStatus } from '@/lib/core/types';

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
  /** Portal mode — full-width, no padding, borderless model selector */
  portalMode?: boolean;
  agents?: AgentStatus[];
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
  portalMode = false,
  agents,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  const filteredAgents = useMemo(() => {
    if (!agents || !showMentionMenu) return [];
    const q = mentionQuery.toLowerCase();
    const allOption: AgentStatus = { name: 'all', status: 'idle' as const };
    const candidates = [allOption, ...agents];
    if (!q) return candidates;
    return candidates.filter((a) => a.name.toLowerCase().includes(q));
  }, [agents, mentionQuery, showMentionMenu]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxH = portalMode ? 240 : 144;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [text, portalMode]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);

      if (!agents || agents.length === 0) {
        setShowMentionMenu(false);
        return;
      }

      const cursorPos = e.target.selectionStart ?? val.length;
      const textBeforeCursor = val.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/(?:^|\s)@([\w-]*)$/);

      if (mentionMatch) {
        setMentionQuery(mentionMatch[1]);
        setMentionIndex(0);
        setShowMentionMenu(true);
      } else {
        setShowMentionMenu(false);
      }
    },
    [agents],
  );

  const insertMention = useCallback(
    (agentName: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const cursorPos = ta.selectionStart ?? text.length;
      const textBeforeCursor = text.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/(?:^|\s)@([\w-]*)$/);
      if (!mentionMatch) return;

      const matchStart =
        mentionMatch.index! + (mentionMatch[0].startsWith(' ') ? 1 : 0);
      const before = text.slice(0, matchStart);
      const after = text.slice(cursorPos);
      const inserted = `@${agentName} `;
      const newText = before + inserted + after;

      setText(newText);
      setShowMentionMenu(false);

      requestAnimationFrame(() => {
        const newPos = before.length + inserted.length;
        ta.setSelectionRange(newPos, newPos);
        ta.focus();
      });
    },
    [text],
  );

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

  useEffect(() => {
    if (!showMentionMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowMentionMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMentionMenu]);

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (uploading || streaming) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  }, [uploading, streaming, uploadFiles]);

  const handleSubmit = useCallback(() => {
    if ((!text.trim() && pendingFiles.length === 0) || disabled) return;
    onSubmit(text.trim(), pendingFiles.length > 0 ? pendingFiles : undefined);
    setText("");
    setPendingFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, pendingFiles, disabled, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredAgents.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredAgents[mentionIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = (text.trim() || pendingFiles.length > 0) && !disabled && !uploading;
  const activeFastModel = FAST_MODELS.find(m => m.id === (selectedFastModel || '')) || FAST_MODELS[0];
  const modelLabel = thinkingMode ? THINKING_MODEL_LABEL : activeFastModel.label;

  return (
    <div
      className={portalMode ? "" : "px-4 py-3"}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={clsx("relative", !portalMode && "max-w-[680px] mx-auto")}>
        {/* Main input container - glass level 2 */}
        <div className={clsx(
          "flex flex-col bg-white/[0.02] backdrop-blur-md border rounded-[14px] focus-within:border-[var(--border-focus)] transition-colors",
          dragging ? "border-[var(--border-focus)] border-dashed" : "border-[var(--border-default)]"
        )}>
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

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTENSIONS}
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Textarea area */}
            <div className={clsx("relative px-4", portalMode ? "pt-4 pb-2" : "")}>
              {showMentionMenu && filteredAgents.length > 0 && (
                <div
                  ref={mentionMenuRef}
                  className="absolute bottom-full left-0 mb-1 w-56 max-h-48 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-xl z-20 py-1"
                >
                  {filteredAgents.map((agent, idx) => (
                    <button
                      key={agent.name}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(agent.name);
                      }}
                      className={clsx(
                        'w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors',
                        idx === mentionIndex
                          ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      <span className="font-medium">@{agent.name}</span>
                      {agent.name === 'all' && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {t('team.collaboration.mentionAllDesc')}
                        </span>
                      )}
                      {agent.name !== 'all' && agent.current_task && (
                        <span className="text-[10px] text-[var(--text-muted)] truncate">
                          {agent.current_task}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ?? t('chat.placeholder')}
                disabled={disabled}
                rows={portalMode ? 4 : 1}
                className={clsx(
                  "w-full bg-transparent text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none leading-6",
                  portalMode ? "min-h-[96px] max-h-[240px]" : "min-h-[24px] max-h-[144px]"
                )}
              />
            </div>

            {/* Controls row: [+] [model] [send] */}
            <div className="flex items-center gap-2 px-3 py-2">
              {/* Attach button (+) */}
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

              <div className="flex-1" />

              {/* Model selector dropdown - ghost button with border-subtle
                  On mobile (< 768px): icon only, no label
                  On tablet/desktop: full label with dropdown icon
              */}
              <div ref={modelMenuRef} className="relative flex-shrink-0">
                <button
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  className={clsx(
                    "flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 h-8 rounded-lg hover:bg-[var(--bg-hover)] transition-colors",
                    !portalMode && "border border-[var(--border-subtle)]"
                  )}
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
