"use client";

import { FileText, FileSpreadsheet, FileImage } from "lucide-react";
import type { AttachmentMeta } from "@/lib/core/types";

interface MessageAttachmentsProps {
  attachments: AttachmentMeta[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getDocIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return FileSpreadsheet;
  return FileText;
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const images = attachments.filter((a) => a.type === "image");
  const docs = attachments.filter((a) => a.type === "document");

  return (
    <div className="mt-2 space-y-2">
      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <a
              key={img.id}
              href={`/api/chat/uploads/${img.relativePath.replace("uploads/", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-zinc-700/50 hover:border-zinc-500 transition-colors"
            >
              <img
                src={`/api/chat/uploads/${img.relativePath.replace("uploads/", "")}`}
                alt={img.name}
                className="w-32 h-24 object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {/* Document badges */}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {docs.map((doc) => {
            const Icon = getDocIcon(doc.name);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-xs"
              >
                <Icon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                <span className="text-zinc-400 truncate max-w-[150px]">{doc.name}</span>
                <span className="text-zinc-600">{formatSize(doc.size)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
