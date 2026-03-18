"use client";

import { useCallback } from "react";
import { FileCode, FileJson, FileImage, FileText, File, Presentation } from "lucide-react";
import clsx from "clsx";
import type { ArtifactRef } from "@/store/slices/artifactSlice";
import { usePulseStore } from "@/store/usePulseStore.new";

// ── Type-to-color mapping ──

const typeColorMap: Record<ArtifactRef["type"], string> = {
  code: "#c084fc",    // purple
  json: "#fbbf24",    // amber
  pptx: "#f472b6",    // pink
  image: "#22d3ee",   // cyan
  markdown: "#34d399", // green
  pdf: "#60a5fa",     // blue
};

// Also map ts/js as "code" type — these come through as type: "code"

const typeIconMap: Record<ArtifactRef["type"], React.ComponentType<{ className?: string }>> = {
  code: FileCode,
  json: FileJson,
  pptx: Presentation,
  image: FileImage,
  markdown: FileText,
  pdf: File,
};

const typeLabelMap: Record<ArtifactRef["type"], string> = {
  code: "Code",
  json: "JSON",
  pptx: "PPTX",
  image: "Image",
  markdown: "Markdown",
  pdf: "PDF",
};

// ── Component ──

interface ArtifactRefCardProps {
  artifact: ArtifactRef;
  isActive?: boolean;
}

export function ArtifactRefCard({ artifact, isActive = false }: ArtifactRefCardProps) {
  const openArtifact = usePulseStore((s) => s.openArtifact);

  const handleClick = useCallback(() => {
    openArtifact(artifact);
  }, [openArtifact, artifact]);

  const color = typeColorMap[artifact.type] || "#fbbf24";
  const Icon = typeIconMap[artifact.type] || File;
  const typeLabel = typeLabelMap[artifact.type] || artifact.type.toUpperCase();

  return (
    <button
      onClick={handleClick}
      className={clsx(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
        "bg-[var(--bg-glass)] border transition-all text-left cursor-pointer",
        "hover:border-[var(--border-accent)]",
        isActive
          ? "border-[var(--border-accent)]"
          : "border-[var(--border-subtle)]",
      )}
    >
      {/* Colored icon square */}
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
          {isActive ? (
            <span style={{ color }}>{typeLabel} &middot; Viewing</span>
          ) : (
            <span>{typeLabel} &middot; Click to preview</span>
          )}
        </div>
      </div>
    </button>
  );
}
