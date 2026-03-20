"use client";

import { useCallback } from "react";
import { FileCode, FileJson, FileImage, FileText, File, Presentation, FileSpreadsheet, Globe, Image } from "lucide-react";
import clsx from "clsx";
import type { ArtifactRef } from "@/store/slices/artifactSlice";
import { usePulseStore } from "@/store/usePulseStore.new";

// ── Type-to-color mapping ──

const typeColorMap: Record<ArtifactRef["type"], string> = {
  code: "#c084fc",
  json: "#f4f4f5",
  pptx: "#f472b6",
  image: "#f4f4f5",
  markdown: "#34d399",
  pdf: "#60a5fa",
  csv: "#34d399",
  excel: "#34d399",
  html: "#f59e0b",
  svg: "#f4f4f5",
};

const typeIconMap: Record<ArtifactRef["type"], React.ComponentType<{ className?: string }>> = {
  code: FileCode,
  json: FileJson,
  pptx: Presentation,
  image: FileImage,
  markdown: FileText,
  pdf: File,
  csv: FileSpreadsheet,
  excel: FileSpreadsheet,
  html: Globe,
  svg: Image,
};

const typeLabelMap: Record<ArtifactRef["type"], string> = {
  code: "Code",
  json: "JSON",
  pptx: "PPTX",
  image: "Image",
  markdown: "Markdown",
  pdf: "PDF",
  csv: "CSV",
  excel: "Excel",
  html: "HTML",
  svg: "SVG",
};

// ── Component ──

interface ArtifactRefCardProps {
  artifact: ArtifactRef;
  isActive?: boolean;
  workspace?: string;
}

export function ArtifactRefCard({ artifact, isActive = false, workspace }: ArtifactRefCardProps) {
  const openArtifact = usePulseStore((s) => s.openArtifact);
  const activeArtifactId = usePulseStore((s) => s.activeArtifactId);
  const artifactPanelOpen = usePulseStore((s) => s.artifactPanelOpen);

  const isViewing = artifactPanelOpen && activeArtifactId === artifact.id;

  const handleClick = useCallback(async () => {
    // If content or url already available, open directly
    if (artifact.content || artifact.url) {
      openArtifact(artifact);
      return;
    }
    // Otherwise, fetch content via /api/files (needed after page reload)
    if (artifact.filePath && workspace) {
      try {
        const params = new URLSearchParams({ path: artifact.filePath, workspace });
        const res = await fetch(`/api/files?${params}`);
        if (res.ok) {
          const content = await res.text();
          openArtifact({ ...artifact, content });
          return;
        }
      } catch { /* fall through */ }
    }
    openArtifact(artifact);
  }, [openArtifact, artifact, workspace]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (artifact.url) {
      window.open(artifact.url, "_blank");
    } else if (artifact.content) {
      const blob = new Blob([artifact.content], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = artifact.filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [artifact]);

  const color = typeColorMap[artifact.type] || "#f4f4f5";
  const Icon = typeIconMap[artifact.type] || File;
  const typeLabel = typeLabelMap[artifact.type] || artifact.type.toUpperCase();

  // Derive sub-label (e.g., "Code · TypeScript")
  const ext = artifact.filename.split('.').pop()?.toUpperCase() || '';
  const subLabel = artifact.type === 'code' ? `Code · ${ext}` : typeLabel;

  return (
    <button
      onClick={handleClick}
      className={clsx(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
        "bg-[var(--bg-glass)] border transition-all text-left cursor-pointer",
        "hover:border-[var(--border-accent)]",
        isViewing
          ? "border-[var(--border-accent)]"
          : "border-[var(--border-subtle)]",
      )}
    >
      {/* Type icon */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <span style={{ color }}>
          <Icon className="w-4 h-4" />
        </span>
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
          {artifact.filename}
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {isViewing ? (
            <span style={{ color }}>{subLabel} &middot; Viewing</span>
          ) : (
            <span>{subLabel}</span>
          )}
        </div>
      </div>

      {/* Download button */}
      {(artifact.content || artifact.url) && (
        <button
          onClick={handleDownload}
          className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
        >
          Download
        </button>
      )}
    </button>
  );
}
