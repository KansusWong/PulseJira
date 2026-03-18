"use client";

import { ChartTable } from "./charts/ChartTable";
import { ChartBar } from "./charts/ChartBar";
import { ChartPie } from "./charts/ChartPie";
import { ChartLine } from "./charts/ChartLine";
import { ChartMetrics } from "./charts/ChartMetrics";
import { ChartComparison } from "./charts/ChartComparison";
import { ChartTimeline } from "./charts/ChartTimeline";
import { ChartMindmap } from "./charts/ChartMindmap";
import { ChartFlowchart } from "./charts/ChartFlowchart";
import { ChartRadar } from "./charts/ChartRadar";
import { ChartSummary } from "./charts/ChartSummary";
import { ChartRating } from "./charts/ChartRating";

interface ChartBlockProps {
  code: string;
  className?: string;
}

export function ChartBlock({ code, className }: ChartBlockProps) {
  let parsed: any;
  try {
    parsed = JSON.parse(code);
  } catch {
    // JSON parse failed — show raw code block as fallback
    return <CodeFallback code={code} className={className} />;
  }

  if (!parsed || typeof parsed !== "object" || !parsed.type) {
    return <CodeFallback code={code} className={className} />;
  }

  const inner = renderChart(parsed);
  if (!inner) {
    return <CodeFallback code={code} className={className} />;
  }

  return (
    <div className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden ${className ?? ""}`}>
      {inner}
    </div>
  );
}

function renderChart(chart: any) {
  switch (chart.type) {
    case "table":
      return <ChartTable chart={chart} />;
    case "bar":
      return <ChartBar chart={chart} />;
    case "pie":
      return <ChartPie chart={chart} />;
    case "line":
      return <ChartLine chart={chart} />;
    case "metrics":
      return <ChartMetrics chart={chart} />;
    case "comparison":
      return <ChartComparison chart={chart} />;
    case "timeline":
      return <ChartTimeline chart={chart} />;
    case "mindmap":
      return <ChartMindmap chart={chart} />;
    case "flowchart":
      return <ChartFlowchart chart={chart} />;
    case "radar":
      return <ChartRadar chart={chart} />;
    case "summary":
      return <ChartSummary chart={chart} />;
    case "rating":
      return <ChartRating chart={chart} />;
    default:
      return null;
  }
}

function CodeFallback({ code, className }: { code: string; className?: string }) {
  return (
    <pre className={`overflow-x-auto rounded-md bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-muted)] border border-[var(--border-subtle)] ${className ?? ""}`}>
      <code>{code}</code>
    </pre>
  );
}
