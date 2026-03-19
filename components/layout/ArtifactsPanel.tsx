"use client";

import { useCallback, useMemo } from "react";
import {
  FileCode,
  FileJson,
  FileImage,
  FileText,
  File,
  Presentation,
  Copy,
  Download,
  X,
} from "lucide-react";
import clsx from "clsx";
import hljs from "highlight.js/lib/common";
import { usePulseStore } from "@/store/usePulseStore.new";
import { MarkdownRenderer } from "../chat/MarkdownRenderer";
import type { ArtifactRef } from "@/store/slices/artifactSlice";

// ── Type maps (shared with ArtifactRefCard for consistency) ──

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

// ── Helpers ──

function countLines(content: string | undefined): number {
  if (!content) return 0;
  return content.split("\n").length;
}

function detectLanguage(filename: string, type: ArtifactRef["type"]): string {
  if (type === "json") return "json";
  const ext = filename.split(".").pop()?.toLowerCase();
  const extMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    css: "css",
    scss: "scss",
    html: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    md: "markdown",
    json: "json",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
  };
  return extMap[ext || ""] || "plaintext";
}

// ── Code Viewer Sub-component ──

function CodeViewer({ content, filename, type }: { content: string; filename: string; type: ArtifactRef["type"] }) {
  const highlighted = useMemo(() => {
    const lang = detectLanguage(filename, type);
    try {
      const result = hljs.highlight(content, { language: lang });
      return result.value;
    } catch {
      // Fallback: try auto-detect
      try {
        const result = hljs.highlightAuto(content);
        return result.value;
      } catch {
        return content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
    }
  }, [content, filename, type]);

  const lines = content.split("\n");

  return (
    <div className="flex-1 overflow-auto font-mono text-sm leading-6">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            // Highlight the individual line
            const lineHighlighted = (() => {
              try {
                const lang = detectLanguage(filename, type);
                return hljs.highlight(line || " ", { language: lang }).value;
              } catch {
                return (line || " ")
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
              }
            })();

            return (
              <tr key={i} className="hover:bg-white/[0.03]">
                <td className="text-right select-none pr-4 pl-4 text-[var(--text-muted)] w-[1%] whitespace-nowrap opacity-50 text-xs">
                  {i + 1}
                </td>
                <td className="pr-4">
                  <span
                    dangerouslySetInnerHTML={{ __html: lineHighlighted }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Download / Unsupported prompt ──

function DownloadPrompt({ artifact }: { artifact: ArtifactRef }) {
  const Icon = typeIconMap[artifact.type] || File;

  const handleDownload = useCallback(() => {
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

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-[var(--bg-glass)] border border-[var(--border-subtle)] max-w-sm">
        <div className="w-14 h-14 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
          <Icon className="w-7 h-7 text-[var(--accent)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">{artifact.filename}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {typeLabelMap[artifact.type]} file &mdash; preview not available
          </p>
        </div>
        {(artifact.url || artifact.content) && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        )}
      </div>
    </div>
  );
}

// ── Error state component ──

function ArtifactErrorState({ artifact, onRetry, onClose }: { artifact: ArtifactRef; onRetry: () => void; onClose: () => void }) {
  const Icon = typeIconMap[artifact.type] || File;

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] max-w-sm">
        <div className="w-14 h-14 rounded-xl bg-[rgba(239,68,68,0.08)] flex items-center justify-center">
          <Icon className="w-7 h-7 text-[#ef4444]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">Failed to load</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">{artifact.filename}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            Retry
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton component ──

function ArtifactLoadingSkeleton() {
  return (
    <div className="flex-1 overflow-auto font-mono text-sm leading-6 p-4 space-y-2">
      {[100, 85, 95, 90, 80, 100, 85, 95].map((width, i) => (
        <div
          key={i}
          className="h-5 rounded shimmer"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

// ── Body renderer ──

function ArtifactBody({ artifact }: { artifact: ArtifactRef }) {
  switch (artifact.type) {
    case "code":
    case "json":
      if (!artifact.content) return <DownloadPrompt artifact={artifact} />;
      return <CodeViewer content={artifact.content} filename={artifact.filename} type={artifact.type} />;

    case "markdown":
      if (!artifact.content) return <DownloadPrompt artifact={artifact} />;
      return (
        <div className="flex-1 overflow-auto p-6">
          <MarkdownRenderer content={artifact.content} />
        </div>
      );

    case "image":
      if (artifact.url) {
        return (
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artifact.url}
              alt={artifact.filename}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        );
      }
      return <DownloadPrompt artifact={artifact} />;

    case "pdf":
      if (artifact.url) {
        return (
          <div className="flex-1 overflow-hidden">
            <iframe
              src={artifact.url}
              title={artifact.filename}
              className="w-full h-full border-0"
            />
          </div>
        );
      }
      return <DownloadPrompt artifact={artifact} />;

    case "pptx":
      if (artifact.url) {
        return (
          <div className="flex-1 overflow-hidden">
            <iframe
              src={artifact.url}
              title={artifact.filename}
              className="w-full h-full border-0"
            />
          </div>
        );
      }
      return <DownloadPrompt artifact={artifact} />;

    default:
      return <DownloadPrompt artifact={artifact} />;
  }
}

// ── Main ArtifactsPanel ──

export function ArtifactsPanel() {
  const openArtifacts = usePulseStore((s) => s.openArtifacts);
  const activeArtifactId = usePulseStore((s) => s.activeArtifactId);
  const setActiveArtifact = usePulseStore((s) => s.setActiveArtifact);
  const closeArtifact = usePulseStore((s) => s.closeArtifact);
  const closeAllArtifacts = usePulseStore((s) => s.closeAllArtifacts);

  const activeArtifact = openArtifacts.find((a) => a.id === activeArtifactId) || openArtifacts[0] || null;
  const ActiveIcon = activeArtifact ? (typeIconMap[activeArtifact.type] || File) : File;

  // ── Handlers ──

  const handleCopy = useCallback(() => {
    if (!activeArtifact?.content) return;
    navigator.clipboard.writeText(activeArtifact.content);
  }, [activeArtifact]);

  const handleDownload = useCallback(() => {
    if (!activeArtifact) return;
    if (activeArtifact.url) {
      window.open(activeArtifact.url, "_blank");
      return;
    }
    if (activeArtifact.content) {
      const blob = new Blob([activeArtifact.content], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = activeArtifact.filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [activeArtifact]);

  if (!activeArtifact) return null;

  const lineCount = countLines(activeArtifact.content);

  return (
    <div className="flex flex-col h-full animate-slide-in-right bg-[#080808]">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 h-12 flex-shrink-0 border-b border-[var(--border-subtle)]">
        <ActiveIcon className="w-4 h-4 text-[var(--text-muted)]" />
        <span className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">
          {activeArtifact.filename}
        </span>

        {/* Action buttons */}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.05] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none"
          title="Copy content"
          aria-label="Copy content"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={handleDownload}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.05] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none"
          title="Download file"
          aria-label="Download file"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={closeAllArtifacts}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.05] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none"
          title="Close panel"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Tab Bar ── */}
      {openArtifacts.length > 1 && (
        <div className="flex items-center gap-0 overflow-x-auto border-b border-[var(--border-subtle)] flex-shrink-0 scrollbar-thin" role="tablist">
          {openArtifacts.map((art) => {
            const isActive = art.id === activeArtifact.id;
            const TabIcon = typeIconMap[art.type] || File;

            return (
              <div
                key={art.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={clsx(
                  "group flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-b-2 transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none",
                  isActive
                    ? "border-[var(--accent)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                )}
                onClick={() => setActiveArtifact(art.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveArtifact(art.id);
                  }
                }}
              >
                <TabIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate max-w-[120px]">{art.filename}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeArtifact(art.id);
                  }}
                  className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/[0.1] transition-all focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none focus-visible:opacity-100"
                  title={`Close ${art.filename}`}
                  aria-label={`Close ${art.filename}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <ArtifactBody artifact={activeArtifact} />
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center gap-3 px-4 h-8 flex-shrink-0 border-t border-[var(--border-subtle)] text-[var(--text-muted)] text-xs">
        <span>{typeLabelMap[activeArtifact.type]}</span>
        {lineCount > 0 && (
          <>
            <span className="opacity-30">&middot;</span>
            <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
          </>
        )}
        {activeArtifact.filePath && (
          <>
            <span className="opacity-30">&middot;</span>
            <span className="truncate font-mono opacity-70">{activeArtifact.filePath}</span>
          </>
        )}
      </div>
    </div>
  );
}
