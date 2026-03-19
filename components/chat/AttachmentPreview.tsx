"use client";

import { X, FileText, Loader2 } from "lucide-react";
import type { AttachmentMeta } from "@/lib/core/types";
import { useTranslation } from "@/lib/i18n";

interface AttachmentPreviewProps {
  files: AttachmentMeta[];
  uploading?: boolean;
  onRemove: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function AttachmentPreview({ files, uploading, onRemove }: AttachmentPreviewProps) {
  const { t } = useTranslation();
  if (files.length === 0 && !uploading) return null;

  return (
    <div className="flex flex-wrap gap-2 px-2 pb-2">
      {files.map((file) => (
        <div
          key={file.id}
          className="group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-glass)] border border-[var(--border-subtle)] text-xs"
        >
          {file.type === "image" ? (
            <img
              src={`/api/chat/uploads/${file.relativePath.replace("uploads/", "")}`}
              alt={file.name}
              className="w-8 h-8 rounded object-cover flex-shrink-0"
            />
          ) : (
            <FileText className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          )}
          <span className="text-[var(--text-secondary)] truncate max-w-[120px]">{file.name}</span>
          <span className="text-[var(--text-muted)]">{formatSize(file.size)}</span>
          <button
            onClick={() => onRemove(file.id)}
            className="p-0.5 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {uploading && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-glass)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{t('chat.uploading')}</span>
        </div>
      )}
    </div>
  );
}
