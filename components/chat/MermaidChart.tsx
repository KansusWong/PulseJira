"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { extractMermaidCode, getMermaid } from "./mermaid-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MermaidChartProps {
  /** Raw Mermaid syntax string */
  code: string;
  /** Optional title shown above the chart */
  title?: string;
  /** Show the export-as-SVG button. Default: true */
  showExport?: boolean;
  /** Extra Tailwind classes for the outer wrapper */
  className?: string;
  /** Called after successful render */
  onRenderSuccess?: () => void;
  /** Called when Mermaid fails to parse/render */
  onRenderError?: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Utility: download a string as a file
// ---------------------------------------------------------------------------

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

let mermaidIdCounter = 0;

export function MermaidChart({
  code,
  title,
  showExport = true,
  className = "",
  onRenderSuccess,
  onRenderError,
}: MermaidChartProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [exportLabel, setExportLabel] = useState<string>("");
  const svgRef = useRef<string>("");

  useEffect(() => {
    const cleaned = extractMermaidCode(code);
    if (!cleaned) return;

    let cancelled = false;

    setStatus("loading");
    setErrorMsg("");

    (async () => {
      // Declare outside try so `finally` can always clean up
      const renderId = `mermaid-${++mermaidIdCounter}-${Date.now()}`;

      try {
        const mermaid = await getMermaid();

        // Clean up any stale element with this ID (shouldn't exist, but be safe)
        document.getElementById(renderId)?.remove();

        const { svg } = await mermaid.render(renderId, cleaned);

        if (cancelled) return;

        if (!svg || svg.trim().length === 0) {
          throw new Error("mermaid.render() returned empty SVG");
        }

        svgRef.current = svg;

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;

          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("width");
            svgEl.removeAttribute("height");
            svgEl.setAttribute("width", "100%");
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
          }
        }

        setStatus("success");
        onRenderSuccess?.();
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[MermaidChart] render failed:", error.message);
        setStatus("error");
        setErrorMsg(error.message);
        onRenderError?.(error);
      } finally {
        // Always remove mermaid's temp element (including error SVGs it injects into body)
        document.getElementById(renderId)?.remove();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, onRenderSuccess, onRenderError]);

  const handleExport = () => {
    if (!svgRef.current) return;
    setExportLabel(t("mermaid.copying"));
    const filename = `${title?.replace(/\s+/g, "-").toLowerCase() ?? "diagram"}.svg`;
    downloadFile(svgRef.current, filename, "image/svg+xml");
    setTimeout(() => setExportLabel(t("mermaid.export")), 1500);
  };

  return (
    <div className={`group relative ${className}`}>
      {/* Floating export button — appears on hover */}
      {showExport && status === "success" && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700/80 backdrop-blur-sm transition-colors duration-150 cursor-pointer"
          >
            <DownloadIcon />
            {exportLabel || t("mermaid.export")}
          </button>
        </div>
      )}

      {/* Optional title */}
      {title && (
        <div className="px-1 pb-2">
          <span className="text-sm font-medium text-zinc-400">{title}</span>
        </div>
      )}

      {/* Chart area */}
      <div className="relative min-h-[120px]">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <SpinnerIcon />
              {t("mermaid.loading")}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-lg bg-red-950/30 border border-red-800/50 p-4">
            <p className="text-sm font-medium text-red-400">
              {t("mermaid.error")}
            </p>
            {errorMsg && (
              <pre className="mt-2 text-xs text-red-500/80 whitespace-pre-wrap break-all font-mono">
                {errorMsg}
              </pre>
            )}
          </div>
        )}

        <div
          ref={containerRef}
          className={`w-full transition-opacity duration-300 ${
            status === "success" ? "opacity-100" : "opacity-0"
          } [&_svg]:mx-auto [&_.label]:font-[inherit]`}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon sub-components
// ---------------------------------------------------------------------------

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
