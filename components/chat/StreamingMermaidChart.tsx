"use client";

import { useEffect, useRef, useState, memo } from "react";
import { extractMermaidCode, getMermaid } from "./mermaid-utils";

interface StreamingMermaidChartProps {
  code: string;
  className?: string;
}

let streamingIdCounter = 0;

/**
 * Progressive mermaid chart renderer for streaming contexts.
 *
 * Uses a "last known good SVG" strategy:
 * - Debounces render attempts by 300ms to avoid thrashing.
 * - On success: shows the SVG with a subtle streaming indicator.
 * - On failure: silently keeps the previous SVG (incomplete syntax is expected).
 * - When no SVG has been produced yet, shows the raw code as fallback.
 */
export const StreamingMermaidChart = memo(function StreamingMermaidChart({
  code,
  className = "",
}: StreamingMermaidChartProps) {
  const [lastGoodSvg, setLastGoodSvg] = useState<string | null>(null);
  const renderingRef = useRef(false);

  useEffect(() => {
    const cleaned = extractMermaidCode(code);
    // Too short to be valid mermaid — skip render attempt
    if (!cleaned || cleaned.length < 10) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (renderingRef.current) return;
      renderingRef.current = true;

      // Declare outside try so `finally` can always clean up
      const renderId = `streaming-mermaid-${++streamingIdCounter}-${Date.now()}`;

      try {
        const mermaid = await getMermaid();
        document.getElementById(renderId)?.remove();

        const { svg } = await mermaid.render(renderId, cleaned);

        if (!cancelled && svg && svg.trim().length > 0) {
          setLastGoodSvg(svg);
        }
      } catch {
        // Silently ignore — incomplete syntax during streaming is expected
      } finally {
        renderingRef.current = false;
        // Always remove mermaid's temp element (including error SVGs it injects into body)
        document.getElementById(renderId)?.remove();
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  // Fallback: show raw code when no successful render yet
  if (!lastGoodSvg) {
    return (
      <div className={`rounded-md bg-zinc-950 p-3 text-sm border border-zinc-800/30 overflow-x-auto ${className}`}>
        <pre className="text-zinc-400 font-mono text-xs whitespace-pre">{code}</pre>
      </div>
    );
  }

  // Show the last successfully rendered SVG
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="relative">
        {/* Streaming indicator */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60 animate-pulse" />
        </div>
        <div
          className="w-full [&_svg]:mx-auto [&_svg]:max-w-full [&_svg]:h-auto [&_.label]:font-[inherit]"
          dangerouslySetInnerHTML={{ __html: lastGoodSvg }}
        />
      </div>
    </div>
  );
});
