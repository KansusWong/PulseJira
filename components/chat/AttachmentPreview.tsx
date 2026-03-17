"use client";

import { X, FileText, Loader2 } from "lucide-react";
import type { AttachmentMeta } from "@/lib/core/types";

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
  if (files.length === 0 && !uploading) return null;

  return (
    <div className="flex flex-wrap gap-2 px-2 pb-2">
      {files.map((file) => (
        <div
          key={file.id}
          className="group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-xs"
        >
          {file.type === "image" ? (
            <img
              src={`/api/chat/uploads/${file.relativePath.replace("uploads/", "")}`}
              alt={file.name}
              className="w-8 h-8 rounded object-cover flex-shrink-0"
            />
          ) : (
            <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          )}
          <span className="text-zinc-400 truncate max-w-[120px]">{file.name}</span>
          <span className="text-zinc-600">{formatSize(file.size)}</span>
          <button
            onClick={() => onRemove(file.id)}
            className="p-0.5 rounded hover:bg-zinc-700 text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {uploading && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-xs text-zinc-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>上传中...</span>
        </div>
      )}
    </div>
  );
}
