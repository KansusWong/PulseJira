/**
 * Shared utilities for Mermaid chart rendering.
 * Used by both MermaidChart (final render) and StreamingMermaidChart (progressive render).
 */

// ---------------------------------------------------------------------------
// Extract mermaid code from a fenced code block if present
// ---------------------------------------------------------------------------

export function extractMermaidCode(raw: string): string {
  const fenceMatch = raw.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
  return fenceMatch ? fenceMatch[1].trim() : raw.trim();
}

// ---------------------------------------------------------------------------
// Dark theme variables — rich blue-tinted palette (Anthropic-inspired)
// ---------------------------------------------------------------------------

export const MERMAID_THEME_VARIABLES = {
  // Node fills — rich dark blue instead of flat zinc gray
  primaryColor: "#1e3a5f",
  primaryBorderColor: "#2d5a8a",
  primaryTextColor: "#e2e8f0",

  // Edge / arrow lines
  lineColor: "#64748b",

  // Secondary elements
  secondaryColor: "#1e293b",

  // Tertiary elements
  tertiaryColor: "#312e81",

  // Edge label backgrounds
  edgeLabelBackground: "#1a2332",

  fontSize: "14px",

  // Cluster / subgraph
  clusterBkg: "#0f172a80",
  clusterBorder: "#1e293b",

  // Notes (sequence diagrams, etc.)
  noteBkgColor: "#1e293b",
  noteTextColor: "#e2e8f0",
  noteBorderColor: "#334155",

  // Sequence-diagram actors
  actorBkg: "#1e3a5f",
  actorBorder: "#2d5a8a",
  actorTextColor: "#e2e8f0",
  actorLineColor: "#64748b",
  signalColor: "#64748b",
  signalTextColor: "#e2e8f0",
} as const;

// ---------------------------------------------------------------------------
// Custom CSS injected into every mermaid SVG for polished styling
// ---------------------------------------------------------------------------

const MERMAID_CUSTOM_CSS = `
  /* Rounded corners on all node shapes */
  .node rect, .node circle, .node ellipse, .node polygon {
    rx: 10;
    ry: 10;
  }
  .cluster rect {
    rx: 10;
    ry: 10;
  }
  /* Medium-weight node labels for readability */
  .nodeLabel {
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  /* Subtler edge labels */
  .edgeLabel {
    font-size: 12px;
    font-weight: 400;
  }
  /* Thinner, cleaner edge paths */
  .flowchart-link {
    stroke-width: 1.5;
  }
`;

// ---------------------------------------------------------------------------
// Singleton mermaid loader — import + initialize once, reuse everywhere
// ---------------------------------------------------------------------------

let mermaidPromise: Promise<any> | null = null;

export function getMermaid(): Promise<any> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "inherit",
        themeVariables: MERMAID_THEME_VARIABLES,
        themeCSS: MERMAID_CUSTOM_CSS,
        flowchart: {
          htmlLabels: true,
          curve: "basis",
          padding: 15,
          nodeSpacing: 50,
          rankSpacing: 60,
        },
        sequence: {
          mirrorActors: false,
        },
      });
      return m.default;
    });
  }
  return mermaidPromise;
}
