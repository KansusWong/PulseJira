"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  X,
  ExternalLink,
  GitBranch,
  User,
  FileText,
  Code,
  Wrench,
  Layers,
  Presentation,
  Target,
  Bot,
  Loader2,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { initKnowledgeGraph } from "@/lib/graph/init-knowledge-graph";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  type: string;
  label: string;
  metadata?: Record<string, any>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface PopupPos {
  x: number;
  y: number;
}

interface SelectedNode {
  id: string;
  type: string;
  label: string;
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// UI constants (used by popup, legend, EdgeButton)
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  mate:    "#34d399",
  mission: "#60a5fa",
  doc:     "#cbd5e1",
  code:    "#c084fc",
  skill:   "#d4d4d8",
  tool:    "#fb923c",
  pptx:    "#f472b6",
  epic:    "#818cf8",
  task:    "#2dd4bf",
};

const TYPE_LABELS: Record<string, string> = {
  mate: "Mate",
  mission: "Mission",
  doc: "Document",
  code: "Code",
  skill: "Skill",
  tool: "Tool",
  pptx: "Presentation",
  epic: "Epic",
  task: "Task",
};

const TYPE_LABELS_ZH: Record<string, string> = {
  mate: "团队成员",
  mission: "协作任务",
  doc: "文档",
  code: "代码产出",
  skill: "技能",
  tool: "工具",
  pptx: "演示文稿",
  epic: "Epic",
  task: "任务",
};

const TYPE_ICONS: Record<string, typeof Bot> = {
  mate: Bot,
  mission: Target,
  doc: FileText,
  code: Code,
  skill: Layers,
  tool: Wrench,
  pptx: Presentation,
};

const EDGE_LABELS_EN: Record<string, string> = {
  produced:     "Produced",
  depends_on:   "Depends on",
  reuses:       "Reuses",
  part_of:      "Part of",
  supersedes:   "Supersedes",
  participated: "Participated",
  led:          "Led",
};

const EDGE_LABELS_ZH: Record<string, string> = {
  produced:     "产出",
  depends_on:   "依赖",
  reuses:       "复用",
  part_of:      "归属",
  supersedes:   "替代",
  participated: "参与",
  led:          "主导",
};

const DEFAULT_COLOR = "#a1a1aa";

const getColor = (type?: string) => TYPE_COLORS[type || ""] || DEFAULT_COLOR;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaultGraph({ data }: { data: GraphData }) {
  const { t, locale } = useTranslation();
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [popupPos, setPopupPos] = useState<PopupPos | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const kgRef = useRef<ReturnType<typeof initKnowledgeGraph> | null>(null);

  // Clear loading once data arrives
  useEffect(() => {
    if (data) setLoading(false);
  }, [data]);

  // ---- Filtered data (raw, not G6-transformed) ----

  const filteredData = useMemo(() => {
    const filteredNodes = filterType
      ? data.nodes.filter((n) => n.type === filterType)
      : data.nodes;
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    return { nodes: filteredNodes, edges: filteredEdges };
  }, [data, filterType]);

  // ---- Derived state for popup ----

  const nodeMap = useMemo(() => {
    const m = new Map<string, SelectedNode>();
    for (const n of data.nodes)
      m.set(n.id, { id: n.id, type: n.type, label: n.label, metadata: n.metadata });
    return m;
  }, [data.nodes]);

  const selectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return data.edges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id
    );
  }, [selectedNode, data.edges]);

  // Navigate to a connected node (from popup EdgeButton)
  const navigateToNode = useCallback(
    (nodeId: string) => {
      if (kgRef.current) {
        kgRef.current.focusNode(nodeId);
      }
    },
    []
  );

  // ---- Helper: compute popup position from graph ----

  const computePopupPos = useCallback((nodeId: string) => {
    const kg = kgRef.current;
    const canvasEl = canvasRef.current;
    if (!kg || !canvasEl) return;

    try {
      const bbox = kg.graph.getElementRenderBounds(nodeId);
      if (bbox) {
        const center = bbox.center;
        let viewportPos: { x: number; y: number } | undefined;
        if (typeof (kg.graph as any).getViewportByCanvas === "function") {
          viewportPos = (kg.graph as any).getViewportByCanvas({ x: center[0], y: center[1] });
        } else if (typeof (kg.graph as any).canvas2Viewport === "function") {
          viewportPos = (kg.graph as any).canvas2Viewport({ x: center[0], y: center[1] });
        } else {
          viewportPos = { x: center[0], y: center[1] };
        }

        if (viewportPos) {
          const rect = canvasEl.getBoundingClientRect();
          const POPUP_W = 420;
          let px = viewportPos.x + 24;
          let py = viewportPos.y - 40;
          if (px + POPUP_W > rect.width) px = viewportPos.x - POPUP_W - 24;
          if (py < 12) py = 12;
          if (px < 12) px = 12;
          setPopupPos({ x: px, y: py });
        }
      }
    } catch {
      const rect = canvasEl.getBoundingClientRect();
      setPopupPos({ x: rect.width / 2 - 210, y: rect.height / 2 - 200 });
    }
  }, []);

  // ---- G6 graph lifecycle ----

  useEffect(() => {
    if (!canvasRef.current) return;

    // Destroy previous
    kgRef.current?.destroy();
    kgRef.current = null;

    setSelectedNode(null);
    setPopupPos(null);

    if (filteredData.nodes.length === 0) return;

    const canvasEl = canvasRef.current;
    const wrapper = wrapperRef.current;
    const { width, height } = (wrapper || canvasEl).getBoundingClientRect();

    const kg = initKnowledgeGraph({
      canvasEl,
      width,
      height,
      data: filteredData,
      onNodeSelect: (node) => {
        if (!node) {
          setSelectedNode(null);
          setPopupPos(null);
          return;
        }
        setSelectedNode({
          id: node.id,
          type: node.type,
          label: node.label || node.id,
          metadata: node.metadata,
        });
        // Popup position is computed after a short delay to let focus animation settle
        setTimeout(() => computePopupPos(node.id), 420);
      },
      onCanvasClick: () => {
        setSelectedNode(null);
        setPopupPos(null);
      },
    });

    kgRef.current = kg;

    // ResizeObserver
    const resizeTarget = wrapper || canvasEl;
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (kgRef.current && w > 0 && h > 0) {
        kgRef.current.resize(w, h).catch(() => {});
      }
    });
    ro.observe(resizeTarget);

    return () => {
      ro.disconnect();
      kgRef.current?.destroy();
      kgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredData]);

  // ---- Click outside popup to close ----

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node)
      ) {
        const canvas = canvasRef.current?.querySelector("canvas");
        if (canvas && canvas.contains(e.target as Node)) return;
        kgRef.current?.resetFocus();
      }
    }
    if (selectedNode) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [selectedNode]);

  // ---- Keyboard handler: Escape to close popup ----

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && selectedNode) {
        e.preventDefault();
        kgRef.current?.resetFocus();
      }
    },
    [selectedNode]
  );

  // ---- Build popup sections by node type ----

  const popupSections = useMemo(() => {
    if (!selectedNode) return null;
    const meta = selectedNode.metadata || {};
    const type = selectedNode.type;
    const color = getColor(type);

    const outgoing = selectedEdges.filter((e) => e.source === selectedNode.id);
    const sections: { title: string; icon: typeof Bot; content: React.ReactNode }[] = [];

    if (type === "mate") {
      sections.push({
        title: t('graph.tooltip.mateIntro'),
        icon: User,
        content: (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {meta.description || t('graph.tooltip.noIntro')}
            </p>
            {meta.domains && (
              <div>
                <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">{t('graph.tooltip.domains')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {(meta.domains as string[]).map((d) => (
                    <span key={d} className="text-[11px] px-2 py-0.5 rounded-full glass-1">{d}</span>
                  ))}
                </div>
              </div>
            )}
            {meta.status && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">{t('graph.tooltip.status')}</span>
                <span className="px-2 py-0.5 rounded-full glass-1">{meta.status}</span>
              </div>
            )}
            {meta.can_lead !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">{t('graph.tooltip.canLead')}</span>
                <span className="text-[var(--text-secondary)]">{meta.can_lead ? t('graph.tooltip.yes') : t('graph.tooltip.no')}</span>
              </div>
            )}
          </div>
        ),
      });
      const produced = outgoing.filter((e) => e.type === "produced");
      const participated = outgoing.filter((e) => e.type === "participated" || e.type === "led");
      if (produced.length > 0 || participated.length > 0) {
        sections.push({
          title: t('graph.tooltip.outputAndParticipation'),
          icon: FileText,
          content: (
            <div className="space-y-1">
              {[...produced, ...participated].map((edge, i) => {
                const other = nodeMap.get(edge.target);
                return <EdgeButton key={i} edge={edge} other={other} isOutgoing onClick={navigateToNode} />;
              })}
            </div>
          ),
        });
      }
    } else if (type === "mission") {
      sections.push({
        title: t('graph.tooltip.missionIntro'),
        icon: Target,
        content: (
          <div className="space-y-3">
            {meta.status && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">{t('graph.tooltip.phase')}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ color, backgroundColor: color + "15" }}>
                  {meta.status}
                </span>
              </div>
            )}
            {meta.lead_mate && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">{t('graph.tooltip.lead')}</span>
                <span className="text-[var(--text-secondary)]">{meta.lead_mate}</span>
              </div>
            )}
            {meta.team_mates && (
              <div>
                <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">{t('graph.tooltip.teamMembers')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {(meta.team_mates as string[]).map((m) => (
                    <span key={m} className="text-[11px] px-2 py-0.5 rounded-full glass-1" style={{ color: "#34d399" }}>{m}</span>
                  ))}
                </div>
              </div>
            )}
            {meta.token_budget != null && (
              <div className="text-xs text-[var(--text-secondary)]">
                Token: {meta.tokens_used?.toLocaleString()} / {meta.token_budget?.toLocaleString()}
                <div className="mt-1 w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, ((meta.tokens_used || 0) / meta.token_budget) * 100)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ),
      });
    } else {
      sections.push({
        title: t('graph.tooltip.outputIntro'),
        icon: TYPE_ICONS[type] || FileText,
        content: (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {meta.description || t('graph.tooltip.noDescription')}
            </p>
            {meta.tags && meta.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(meta.tags as string[]).map((tag) => (
                  <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full glass-1">{tag}</span>
                ))}
              </div>
            )}
            {meta.reuse_count != null && meta.reuse_count > 0 && (
              <div className="text-xs text-[var(--text-secondary)]">
                {t('graph.tooltip.reusedTimes', { count: String(meta.reuse_count) })}
              </div>
            )}
            {meta.created_by_mate && (
              <div className="text-xs text-[var(--text-secondary)]">
                {t('graph.tooltip.createdBy', { name: meta.created_by_mate })}
              </div>
            )}
          </div>
        ),
      });
    }

    if (selectedEdges.length > 0) {
      sections.push({
        title: t('graph.tooltip.relationships'),
        icon: GitBranch,
        content: (
          <div className="space-y-1">
            {selectedEdges.map((edge, i) => {
              const isOut = edge.source === selectedNode.id;
              const otherId = isOut ? edge.target : edge.source;
              const other = nodeMap.get(otherId);
              return <EdgeButton key={i} edge={edge} other={other} isOutgoing={isOut} onClick={navigateToNode} />;
            })}
          </div>
        ),
      });
    }

    return sections;
  }, [selectedNode, selectedEdges, nodeMap, navigateToNode, t]);

  // ---- Stats ----

  const statsNodeCount = filteredData.nodes.length;
  const statsEdgeCount = filteredData.edges.length;

  // ---- Retry handler ----

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    window.location.reload();
  };

  // ---- Render ----

  return (
    <div
      className="relative h-full bg-[#050505] focus-visible:outline-none overflow-hidden"
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={t('graph.canvasLabel')}
    >
      {/* Dedicated G6 canvas container */}
      <div ref={canvasRef} className="absolute inset-0" />

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-base)] z-50">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
            <span className="text-sm text-[var(--text-muted)]">{t("graph.loading") || "Loading graph..."}</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-base)] z-50">
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="w-14 h-14 rounded-xl bg-[rgba(239,68,68,0.08)] flex items-center justify-center">
              <X className="w-7 h-7 text-[#ef4444]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                {t("graph.loadFailed") || "Failed to load graph"}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">{error}</p>
            </div>
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
            >
              {t("common.retry") || "Retry"}
            </button>
          </div>
        </div>
      )}

      {/* Ambient glow overlays */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <div
          className="absolute w-[800px] h-[800px] rounded-full"
          style={{ top: "10%", left: "15%", background: "radial-gradient(circle, rgba(255,255,255,0.04), transparent 70%)" }}
        />
        <div
          className="absolute w-[600px] h-[600px] rounded-full"
          style={{ bottom: "20%", right: "10%", background: "radial-gradient(circle, rgba(255,255,255,0.04), transparent 70%)" }}
        />
        <div
          className="absolute w-[700px] h-[700px] rounded-full"
          style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "radial-gradient(circle, rgba(255,255,255,0.04), transparent 70%)" }}
        />
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 glass-2 rounded-xl p-3 z-10">
        {Object.entries(TYPE_COLORS).map(([type, color]) => {
          const Icon = TYPE_ICONS[type];
          const isActive = filterType === type;
          const labelDict = locale === "zh" ? TYPE_LABELS_ZH : TYPE_LABELS;
          return (
            <button
              key={type}
              onClick={() => setFilterType(isActive ? null : type)}
              className="flex items-center gap-1.5 transition-all hover:scale-105"
            >
              <span
                className={`w-[6px] h-[6px] rounded-full transition-all ${isActive ? "ring-2 ring-[#e4e4e7] ring-offset-2 ring-offset-[#050505]" : ""}`}
                style={{ backgroundColor: color }}
              />
              {Icon && <Icon className="w-3.5 h-3.5" style={{ color }} />}
              <span className="text-[11px] text-[var(--text-secondary)]">{labelDict[type] || type}</span>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="absolute top-4 left-4 glass-1 rounded-full px-3 py-1.5 z-10">
        <span className="text-[12px] text-[var(--text-muted)]">
          {statsNodeCount} nodes &middot; {statsEdgeCount} edges
        </span>
      </div>

      {/* ---- Floating Popup Card ---- */}
      {selectedNode && popupPos && popupSections && (
        <div
          ref={popupRef}
          className="absolute z-50 w-[420px] max-h-[70vh] overflow-hidden glass-3 rounded-2xl shadow-lg flex flex-col"
          style={{ left: popupPos.x, top: popupPos.y }}
        >
          <div
            className="px-5 pt-4 pb-3 border-b border-[var(--border-subtle)]"
            style={{ background: `linear-gradient(135deg, ${getColor(selectedNode.type)}0f, transparent)` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-[40px] h-[40px] rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: getColor(selectedNode.type) + "18" }}
                >
                  {(() => {
                    const Icon = TYPE_ICONS[selectedNode.type] || FileText;
                    return <Icon className="w-5 h-5" style={{ color: getColor(selectedNode.type) }} />;
                  })()}
                </div>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-medium text-[var(--text-primary)] leading-tight truncate">
                    {selectedNode.label}
                  </h2>
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider mt-0.5 inline-block"
                    style={{ color: getColor(selectedNode.type) }}
                  >
                    {(locale === "zh" ? TYPE_LABELS_ZH : TYPE_LABELS)[selectedNode.type] || selectedNode.type}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  kgRef.current?.resetFocus();
                }}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {popupSections.map((section, i) => {
              const SIcon = section.icon;
              return (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <SIcon className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <h3 className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      {section.title}
                    </h3>
                  </div>
                  {section.content}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge button
// ---------------------------------------------------------------------------

function EdgeButton({
  edge,
  other,
  isOutgoing,
  onClick,
}: {
  edge: GraphEdge;
  other: SelectedNode | undefined;
  isOutgoing: boolean;
  onClick: (id: string) => void;
}) {
  const { locale } = useTranslation();
  const otherId = isOutgoing ? edge.target : edge.source;
  const otherColor = other ? getColor(other.type) : DEFAULT_COLOR;
  const typeLabels = locale === 'zh' ? TYPE_LABELS_ZH : TYPE_LABELS;
  const edgeLabels = locale === 'zh' ? EDGE_LABELS_ZH : EDGE_LABELS_EN;

  return (
    <button
      onClick={() => onClick(otherId)}
      className="w-full flex items-center gap-2.5 text-xs py-2 px-3 rounded-lg glass-1 hover:bg-[var(--bg-elevated)] transition-colors text-left group"
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: otherColor }} />
      <div className="flex-1 min-w-0">
        <span className="text-[var(--text-primary)] block truncate group-hover:text-[var(--text-primary)]">
          {other?.label || otherId}
        </span>
        <span className="text-[var(--text-secondary)] text-[10px]">
          {other ? typeLabels[other.type] || other.type : "unknown"}
        </span>
      </div>
      <span className="text-[var(--text-secondary)] flex-shrink-0 text-[10px] glass-1 px-2 py-0.5 rounded-full">
        {isOutgoing ? "\u2192" : "\u2190"} {edgeLabels[edge.type] || edge.type}
      </span>
      <ExternalLink className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}
