"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
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
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

// Dynamic import — react-force-graph-2d uses Canvas (browser-only)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

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

interface FGNode {
  id: string;
  type: string;
  label: string;
  metadata?: Record<string, any>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
  type: string;
}

// Click position for popup placement
interface PopupPos {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Color / style config
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  mate:    "#34d399",
  mission: "#60a5fa",
  doc:     "#fbbf24",
  code:    "#c084fc",
  skill:   "#22d3ee",
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

const EDGE_LABELS: Record<string, string> = {
  produced:     "产出",
  depends_on:   "依赖",
  reuses:       "复用",
  part_of:      "归属",
  supersedes:   "替代",
  participated: "参与",
  led:          "主导",
};

const DEFAULT_COLOR = "#71717a";

function getColor(type: string) {
  return TYPE_COLORS[type] || DEFAULT_COLOR;
}

const NODE_RADII: Record<string, number> = {
  mate: 13,
  mission: 16,
  epic: 14,
  doc: 11,
  code: 11,
  skill: 8,
  tool: 8,
  pptx: 10,
  task: 10,
};

function getNodeRadius(node: FGNode) {
  return NODE_RADII[node.type] || 10;
}

// Canvas-drawn geometric shape icons per node type (fallback for cross-OS consistency)
function drawNodeIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type: string, color: string) {
  const iconSize = r * 0.55;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (type) {
    case "mate": {
      // Person silhouette: head circle + body arc
      const headR = iconSize * 0.32;
      ctx.beginPath();
      ctx.arc(x, y - iconSize * 0.2, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y + iconSize * 0.55, iconSize * 0.45, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    }
    case "mission": {
      // Target / crosshair: concentric circles + cross lines
      ctx.beginPath();
      ctx.arc(x, y, iconSize * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, iconSize * 0.25, 0, Math.PI * 2);
      ctx.fill();
      // Cross lines
      ctx.beginPath();
      ctx.moveTo(x - iconSize * 0.8, y);
      ctx.lineTo(x + iconSize * 0.8, y);
      ctx.moveTo(x, y - iconSize * 0.8);
      ctx.lineTo(x, y + iconSize * 0.8);
      ctx.stroke();
      break;
    }
    case "doc": {
      // Document: rounded rectangle with lines
      const w = iconSize * 0.65;
      const h = iconSize * 0.85;
      ctx.beginPath();
      ctx.roundRect(x - w, y - h, w * 2, h * 2, 1.5);
      ctx.stroke();
      // Text lines
      ctx.beginPath();
      ctx.moveTo(x - w * 0.5, y - h * 0.35);
      ctx.lineTo(x + w * 0.5, y - h * 0.35);
      ctx.moveTo(x - w * 0.5, y + h * 0.05);
      ctx.lineTo(x + w * 0.5, y + h * 0.05);
      ctx.moveTo(x - w * 0.5, y + h * 0.45);
      ctx.lineTo(x + w * 0.2, y + h * 0.45);
      ctx.stroke();
      break;
    }
    case "code": {
      // Angle brackets: < />
      ctx.beginPath();
      ctx.moveTo(x - iconSize * 0.35, y - iconSize * 0.45);
      ctx.lineTo(x - iconSize * 0.75, y);
      ctx.lineTo(x - iconSize * 0.35, y + iconSize * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + iconSize * 0.35, y - iconSize * 0.45);
      ctx.lineTo(x + iconSize * 0.75, y);
      ctx.lineTo(x + iconSize * 0.35, y + iconSize * 0.45);
      ctx.stroke();
      break;
    }
    case "skill": {
      // Lightning bolt
      ctx.beginPath();
      ctx.moveTo(x + iconSize * 0.15, y - iconSize * 0.75);
      ctx.lineTo(x - iconSize * 0.3, y + iconSize * 0.05);
      ctx.lineTo(x + iconSize * 0.05, y + iconSize * 0.05);
      ctx.lineTo(x - iconSize * 0.15, y + iconSize * 0.75);
      ctx.lineTo(x + iconSize * 0.3, y - iconSize * 0.05);
      ctx.lineTo(x - iconSize * 0.05, y - iconSize * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "tool": {
      // Wrench shape
      ctx.beginPath();
      ctx.arc(x - iconSize * 0.35, y - iconSize * 0.35, iconSize * 0.3, Math.PI * 0.7, Math.PI * 2.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - iconSize * 0.15, y - iconSize * 0.15);
      ctx.lineTo(x + iconSize * 0.55, y + iconSize * 0.55);
      ctx.stroke();
      break;
    }
    case "pptx": {
      // Bar chart
      const bw = iconSize * 0.2;
      ctx.fillRect(x - iconSize * 0.6, y + iconSize * 0.1, bw, iconSize * 0.6);
      ctx.fillRect(x - iconSize * 0.15, y - iconSize * 0.35, bw, iconSize * 1.05);
      ctx.fillRect(x + iconSize * 0.3, y - iconSize * 0.1, bw, iconSize * 0.8);
      break;
    }
    case "epic": {
      // Package / box
      const bw = iconSize * 0.7;
      const bh = iconSize * 0.55;
      ctx.beginPath();
      ctx.roundRect(x - bw, y - bh, bw * 2, bh * 2, 2);
      ctx.stroke();
      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(x - bw, y - bh * 0.1);
      ctx.lineTo(x + bw, y - bh * 0.1);
      ctx.stroke();
      // Vertical tab
      ctx.beginPath();
      ctx.moveTo(x - bw * 0.3, y - bh);
      ctx.lineTo(x - bw * 0.3, y - bh * 0.1);
      ctx.moveTo(x + bw * 0.3, y - bh);
      ctx.lineTo(x + bw * 0.3, y - bh * 0.1);
      ctx.stroke();
      break;
    }
    case "task": {
      // Checkbox with check
      const s = iconSize * 0.65;
      ctx.beginPath();
      ctx.roundRect(x - s, y - s, s * 2, s * 2, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.45, y + s * 0.05);
      ctx.lineTo(x - s * 0.05, y + s * 0.45);
      ctx.lineTo(x + s * 0.5, y - s * 0.4);
      ctx.stroke();
      break;
    }
    default: {
      // Generic dot
      ctx.beginPath();
      ctx.arc(x, y, iconSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// d3-zoom transform: { k: zoom, x: panX, y: panY }
interface ZoomTransform { k: number; x: number; y: number }

export function VaultGraph({ data }: { data: GraphData }) {
  const { t, locale } = useTranslation();
  const [selectedNode, setSelectedNode] = useState<FGNode | null>(null);
  const [popupPos, setPopupPos] = useState<PopupPos | null>(null);
  const [hoveredNode, setHoveredNode] = useState<FGNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [filterType, setFilterType] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  // Track the graph's current zoom/pan transform
  const transformRef = useRef<ZoomTransform>({ k: 1, x: 0, y: 0 });

  // Hover glow animation phase (driven by rAF, stored in ref to avoid re-renders)
  const hoverPhaseRef = useRef<number>(0);
  const hoverAnimFrameRef = useRef<number>(0);

  // Hovered edge for midpoint label
  const [hoveredEdge, setHoveredEdge] = useState<FGLink | null>(null);

  // Edge gradient cache: only recreate when node positions change > 5px
  const edgeGradientCache = useRef<
    Map<string, { gradient: CanvasGradient; srcX: number; srcY: number; tgtX: number; tgtY: number }>
  >(new Map());

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Hover glow animation: rAF pulse on 2s sine wave
  useEffect(() => {
    if (!hoveredNode) {
      hoverPhaseRef.current = 0;
      return;
    }
    let running = true;
    let lastTime = performance.now();
    function animate(now: number) {
      if (!running) return;
      const dt = (now - lastTime) / 1000; // seconds
      lastTime = now;
      // 2s cycle → frequency = π/s
      hoverPhaseRef.current += dt * Math.PI;
      // Trigger re-render on the force graph by tickling it
      const fg = fgRef.current;
      if (fg) {
        // Force a repaint by calling .refresh() if available (newer versions)
        // or just call d3ReheatSimulation with tiny alpha
        try {
          if (typeof fg.refresh === "function") {
            fg.refresh();
          }
        } catch {
          // noop — graph will repaint on next interaction
        }
      }
      hoverAnimFrameRef.current = requestAnimationFrame(animate);
    }
    hoverAnimFrameRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      cancelAnimationFrame(hoverAnimFrameRef.current);
    };
  }, [hoveredNode]);

  // After data loads: configure forces + manual zoom-to-fill
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    fg.d3Force("charge")?.strength(-4000).distanceMax(2000);
    fg.d3Force("link")?.distance(350).strength(0.15);
    fg.d3Force("center")?.strength(0.005);
    fg.d3ReheatSimulation();

    // Manual zoom-to-fill: calculate bounding box and zoom to cover viewport
    function fitToScreen() {
      const fg2 = fgRef.current;
      if (!fg2) return;
      const gd = fg2.graphData();
      if (!gd?.nodes?.length) return;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of gd.nodes) {
        if (n.x != null && n.y != null) {
          if (n.x < minX) minX = n.x;
          if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.y > maxY) maxY = n.y;
        }
      }
      if (!isFinite(minX)) return;

      const graphW = (maxX - minX) || 1;
      const graphH = (maxY - minY) || 1;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      // 0.85 factor so nodes don't touch the very edge
      const zoom = 0.85 * Math.min(
        dimensions.width / graphW,
        dimensions.height / graphH,
      );
      fg2.centerAt(cx, cy, 400);
      fg2.zoom(zoom, 400);
    }

    const t1 = setTimeout(fitToScreen, 2500);
    const t2 = setTimeout(fitToScreen, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [data, dimensions]);

  // Click outside popup to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        // Don't close if clicking a canvas node (handled by onNodeClick)
        const canvas = containerRef.current?.querySelector("canvas");
        if (canvas && canvas.contains(e.target as Node)) return;
        setSelectedNode(null);
        setPopupPos(null);
      }
    }
    if (selectedNode) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [selectedNode]);

  // Convert data — place nodes in a large initial circle so simulation
  // starts spread out rather than all at origin
  const graphData = useMemo(() => {
    const filteredNodes = filterType
      ? data.nodes.filter(n => n.type === filterType)
      : data.nodes;

    const count = filteredNodes.length || 1;
    const initRadius = Math.max(count * 40, 400);
    const nodes: FGNode[] = filteredNodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / count;
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        metadata: n.metadata,
        x: Math.cos(angle) * initRadius,
        y: Math.sin(angle) * initRadius,
      };
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: FGLink[] = data.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.type }));
    return { nodes, links };
  }, [data, filterType]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, FGNode>();
    for (const n of graphData.nodes) m.set(n.id, n);
    return m;
  }, [graphData.nodes]);

  const selectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return data.edges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id
    );
  }, [selectedNode, data.edges]);

  // ---- Renderers ----

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as FGNode;
      const r = getNodeRadius(n);
      const color = getColor(n.type);
      const isSelected = selectedNode?.id === n.id;
      const isHovered = hoveredNode?.id === n.id;
      const x = n.x || 0;
      const y = n.y || 0;

      ctx.save();

      // --- Step 1: Outer glow ---
      if (isSelected) {
        // Selected: large white + colored glow
        ctx.shadowBlur = 24;
        ctx.shadowColor = color + "55"; // ~33% opacity
        ctx.beginPath();
        ctx.arc(x, y, r * 1.2, 0, 2 * Math.PI);
        ctx.fillStyle = color + "18"; // ~10% fill
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (isHovered) {
        // Hovered: animated pulsing glow
        const phase = hoverPhaseRef.current;
        // Sine wave: 0→1→0 over 2s cycle. Map to glow intensity 15→25.
        const pulse = (Math.sin(phase) + 1) / 2; // 0..1
        const glowIntensity = 15 + pulse * 10;
        // Alpha range: 15% (~0x26) to 30% (~0x4d)
        const alphaHex = Math.round((0.15 + pulse * 0.15) * 255)
          .toString(16)
          .padStart(2, "0");
        ctx.shadowBlur = glowIntensity;
        ctx.shadowColor = color + alphaHex;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.2, 0, 2 * Math.PI);
        ctx.fillStyle = color + "12";
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Default: subtle glow
        ctx.shadowBlur = 12;
        ctx.shadowColor = color + "26"; // ~15% opacity
        ctx.beginPath();
        ctx.arc(x, y, r * 1.2, 0, 2 * Math.PI);
        ctx.fillStyle = color + "0a"; // ~4% fill
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // --- Step 2: Clear shadow for subsequent draws ---
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // --- Step 3: Dark filled circle (node body) ---
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = "#0a0a0b";
      ctx.fill();

      // --- Step 4: Colored border (or white for selected) ---
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        // Re-add glow for selected border
        ctx.shadowBlur = 24;
        ctx.shadowColor = color + "55";
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // --- Step 5: Draw icon inside node ---
      drawNodeIcon(ctx, x, y, r, n.type, color);

      // --- Step 6: Label (node name) below ---
      const fontSize = Math.min(Math.max(12 / globalScale, 3), 14);
      ctx.font = `${isSelected || isHovered ? "600 " : "400 "}${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      // Text shadow for readability
      ctx.fillStyle = "#050505";
      ctx.fillText(n.label, x + 0.5, y + r + 5.5);
      ctx.fillStyle = isSelected || isHovered ? "#ffffff" : "#f4f4f5"; // text-primary, brighter on interact
      ctx.fillText(n.label, x, y + r + 5);

      // --- Step 7: Type label below name ---
      const typeFontSize = Math.min(Math.max(8 / globalScale, 2.5), 9);
      ctx.font = `500 ${typeFontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const typeLabel = (TYPE_LABELS[n.type] || n.type).toUpperCase();
      ctx.fillStyle = color + "99"; // ~60% opacity
      ctx.fillText(typeLabel, x, y + r + 5 + fontSize + 2);

      ctx.restore();
    },
    [selectedNode, hoveredNode]
  );

  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = link.source as FGNode;
      const tgt = link.target as FGNode;
      if (!src.x || !src.y || !tgt.x || !tgt.y) return;

      const srcColor = getColor(src.type);
      const tgtColor = getColor(tgt.type);

      const isConnectedToSelected =
        selectedNode &&
        (src.id === selectedNode.id || tgt.id === selectedNode.id);

      const isEdgeHovered =
        hoveredEdge &&
        ((hoveredEdge.source as FGNode).id === src.id && (hoveredEdge.target as FGNode).id === tgt.id);

      // Determine if we should fade (there is a selection but this edge is NOT connected)
      const shouldFade = selectedNode && !isConnectedToSelected;

      ctx.save();

      // --- Gradient caching ---
      const cacheKey = `${src.id}->${tgt.id}`;
      let gradient: CanvasGradient;
      const cached = edgeGradientCache.current.get(cacheKey);
      const dx = cached ? Math.abs(cached.srcX - src.x) + Math.abs(cached.srcY - src.y) +
                          Math.abs(cached.tgtX - tgt.x) + Math.abs(cached.tgtY - tgt.y) : Infinity;

      if (cached && dx < 5) {
        gradient = cached.gradient;
      } else {
        gradient = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
        gradient.addColorStop(0, srcColor + "66"); // ~40% opacity
        gradient.addColorStop(1, tgtColor + "66"); // ~40% opacity
        edgeGradientCache.current.set(cacheKey, {
          gradient,
          srcX: src.x,
          srcY: src.y,
          tgtX: tgt.x,
          tgtY: tgt.y,
        });
      }

      // --- Choose styles based on state ---
      if (shouldFade) {
        ctx.globalAlpha = 0.2;
      } else if (isConnectedToSelected) {
        // Amber glow for connected edges
        ctx.globalAlpha = 1.0;
      } else if (isEdgeHovered) {
        ctx.globalAlpha = 1.0;
      }

      // --- First pass: glow line ---
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      if (isConnectedToSelected) {
        // Amber glow for selected connections
        ctx.strokeStyle = "#f59e0b4d"; // accent at ~30%
        ctx.lineWidth = 5;
      } else {
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        if (!shouldFade && !isEdgeHovered) {
          ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.3;
        }
      }
      ctx.stroke();

      // --- Second pass: sharp line ---
      // Reset alpha for sharp pass
      if (shouldFade) {
        ctx.globalAlpha = 0.2;
      } else {
        ctx.globalAlpha = isEdgeHovered ? 1.0 : 0.8;
      }

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      if (isConnectedToSelected) {
        ctx.strokeStyle = "#f59e0bcc"; // accent at ~80%
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();

      // --- Arrowhead ---
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      const arrowLen = isConnectedToSelected ? 10 : 7;
      const tgtR = getNodeRadius(tgt);
      const ax = tgt.x - Math.cos(angle) * (tgtR + 4);
      const ay = tgt.y - Math.sin(angle) * (tgtR + 4);

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(
        ax - arrowLen * Math.cos(angle - Math.PI / 7),
        ay - arrowLen * Math.sin(angle - Math.PI / 7)
      );
      ctx.lineTo(
        ax - arrowLen * Math.cos(angle + Math.PI / 7),
        ay - arrowLen * Math.sin(angle + Math.PI / 7)
      );
      ctx.closePath();
      if (isConnectedToSelected) {
        ctx.fillStyle = "#f59e0bcc";
      } else {
        ctx.fillStyle = tgtColor + (shouldFade ? "33" : "99");
      }
      ctx.fill();

      // --- Midpoint label pill (for highlighted or hovered edges) ---
      if (isConnectedToSelected || isEdgeHovered) {
        ctx.globalAlpha = 1.0;
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        const fontSize = Math.min(Math.max(10 / globalScale, 3), 12);
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        const text = EDGE_LABELS[link.type] || link.type;
        const tw = ctx.measureText(text).width;

        // Glass-like pill background
        ctx.fillStyle = "#18181bee"; // bg-surface with high alpha
        ctx.beginPath();
        ctx.roundRect(mx - tw / 2 - 5, my - fontSize / 2 - 3, tw + 10, fontSize + 6, 4);
        ctx.fill();
        // Border
        ctx.strokeStyle = "#27272a";
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // Text
        ctx.fillStyle = isConnectedToSelected ? "#f59e0b" : "#a1a1aa"; // accent or text-secondary
        ctx.textBaseline = "middle";
        ctx.fillText(text, mx, my);
      }

      ctx.restore();
    },
    [selectedNode, hoveredEdge]
  );

  // ---- Popup follows selected node via rAF (no state in onZoom) ----

  const selectedNodeRef = useRef<FGNode | null>(null);
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  // rAF loop: reads transform + node coords → updates popupPos
  useEffect(() => {
    if (!selectedNode) {
      selectedNodeRef.current = null;
      return;
    }
    selectedNodeRef.current = selectedNode;
    let raf: number;
    let lastX = -1, lastY = -1;

    function tick() {
      const n = selectedNodeRef.current;
      const dim = dimensionsRef.current;
      const fg = fgRef.current;
      if (n && n.x != null && n.y != null) {
        let sx: number, sy: number;
        // Prefer graph2ScreenCoords (accounts for actual canvas transform)
        if (fg && typeof fg.graph2ScreenCoords === "function") {
          try {
            const s = fg.graph2ScreenCoords(n.x, n.y);
            sx = s.x; sy = s.y;
          } catch {
            const t = transformRef.current;
            sx = n.x * t.k + t.x; sy = n.y * t.k + t.y;
          }
        } else {
          const t = transformRef.current;
          sx = n.x * t.k + t.x; sy = n.y * t.k + t.y;
        }
        const rx = Math.round(sx);
        const ry = Math.round(sy);
        if (rx !== lastX || ry !== lastY) {
          lastX = rx;
          lastY = ry;
          const POPUP_W = 420;
          const POPUP_H_MAX = dim.height * 0.7;
          let px = sx + 24;
          let py = sy - 40;
          if (px + POPUP_W > dim.width) px = sx - POPUP_W - 24;
          if (py + POPUP_H_MAX > dim.height) py = dim.height - POPUP_H_MAX - 12;
          if (py < 12) py = 12;
          if (px < 12) px = 12;
          setPopupPos({ x: px, y: py });
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedNode]);

  // onZoom handler: just update the ref, NO state updates
  const handleZoom = useCallback((t: any) => {
    transformRef.current = { k: t.k, x: t.x, y: t.y };
  }, []);

  // ---- Node Click ----

  const handleNodeClick = useCallback(
    (node: any) => {
      const n = node as FGNode;
      if (selectedNode?.id === n.id) {
        setSelectedNode(null);
        setPopupPos(null);
        return;
      }
      setSelectedNode(n);
      // Try to get the actual current transform from the canvas
      const fg = fgRef.current;
      if (fg && typeof fg.graph2ScreenCoords === "function" && n.x != null && n.y != null) {
        try {
          const s = fg.graph2ScreenCoords(n.x, n.y);
          if (s && isFinite(s.x) && isFinite(s.y)) {
            const dim = dimensionsRef.current;
            const POPUP_W = 420;
            let px = s.x + 24, py = s.y - 40;
            if (px + POPUP_W > dim.width) px = s.x - POPUP_W - 24;
            if (py < 12) py = 12;
            if (px < 12) px = 12;
            setPopupPos({ x: px, y: py });
          }
        } catch {
          // Fallback: center of viewport
          const dim = dimensionsRef.current;
          setPopupPos({ x: dim.width / 2 - 210, y: dim.height / 2 - 200 });
        }
      }
    },
    [selectedNode]
  );

  // Navigate to connected node
  const navigateToNode = useCallback(
    (nodeId: string) => {
      const target = nodeMap.get(nodeId);
      if (!target) return;
      setSelectedNode(target);
      if (fgRef.current) {
        fgRef.current.centerAt(target.x, target.y, 400);
      }
    },
    [nodeMap]
  );

  // ---- Build popup sections by node type ----

  const popupSections = useMemo(() => {
    if (!selectedNode) return null;
    const meta = selectedNode.metadata || {};
    const type = selectedNode.type;
    const color = getColor(type);

    // Group edges
    const outgoing = selectedEdges.filter((e) => e.source === selectedNode.id);
    const incoming = selectedEdges.filter((e) => e.target === selectedNode.id);

    // Section builders per type
    const sections: { title: string; icon: typeof Bot; content: React.ReactNode }[] = [];

    if (type === "mate") {
      // 人物介绍
      sections.push({
        title: "人物介绍",
        icon: User,
        content: (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {meta.description || "暂无介绍"}
            </p>
            {meta.domains && (
              <div>
                <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">擅长领域</span>
                <div className="flex flex-wrap gap-1.5">
                  {(meta.domains as string[]).map((d) => (
                    <span key={d} className="text-[11px] px-2 py-0.5 rounded-full glass-1">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {meta.status && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">状态</span>
                <span className="px-2 py-0.5 rounded-full glass-1">{meta.status}</span>
              </div>
            )}
            {meta.can_lead !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">可主导任务</span>
                <span className="text-[var(--text-secondary)]">{meta.can_lead ? "是" : "否"}</span>
              </div>
            )}
          </div>
        ),
      });
      // 产出
      const produced = outgoing.filter((e) => e.type === "produced");
      const participated = outgoing.filter((e) => e.type === "participated" || e.type === "led");
      if (produced.length > 0 || participated.length > 0) {
        sections.push({
          title: "产出 & 参与",
          icon: FileText,
          content: (
            <div className="space-y-1">
              {[...produced, ...participated].map((edge, i) => {
                const other = nodeMap.get(edge.target);
                return (
                  <EdgeButton key={i} edge={edge} other={other} isOutgoing onClick={navigateToNode} />
                );
              })}
            </div>
          ),
        });
      }
    } else if (type === "mission") {
      // 任务介绍
      sections.push({
        title: "任务介绍",
        icon: Target,
        content: (
          <div className="space-y-3">
            {meta.status && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">阶段</span>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ color, backgroundColor: color + "15" }}
                >
                  {meta.status}
                </span>
              </div>
            )}
            {meta.lead_mate && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">主导</span>
                <span className="text-[var(--text-secondary)]">{meta.lead_mate}</span>
              </div>
            )}
            {meta.team_mates && (
              <div>
                <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">团队成员</span>
                <div className="flex flex-wrap gap-1.5">
                  {(meta.team_mates as string[]).map((m) => (
                    <span key={m} className="text-[11px] px-2 py-0.5 rounded-full glass-1" style={{ color: '#34d399' }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {meta.token_budget != null && (
              <div className="text-xs text-[var(--text-muted)]">
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
      // doc / code / skill / tool / pptx — 产出介绍
      sections.push({
        title: "产出介绍",
        icon: TYPE_ICONS[type] || FileText,
        content: (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {meta.description || "暂无描述"}
            </p>
            {meta.tags && meta.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(meta.tags as string[]).map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-2 py-0.5 rounded-full glass-1"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {meta.reuse_count != null && meta.reuse_count > 0 && (
              <div className="text-xs text-[var(--text-muted)]">
                被复用 <span className="text-[var(--text-secondary)] font-medium">{meta.reuse_count}</span> 次
              </div>
            )}
            {meta.created_by_mate && (
              <div className="text-xs text-[var(--text-muted)]">
                创建者 <span className="text-[var(--text-secondary)]">{meta.created_by_mate}</span>
              </div>
            )}
          </div>
        ),
      });
    }

    // 关联关系 — always show
    if (selectedEdges.length > 0) {
      sections.push({
        title: "关联关系",
        icon: GitBranch,
        content: (
          <div className="space-y-1">
            {selectedEdges.map((edge, i) => {
              const isOut = edge.source === selectedNode.id;
              const otherId = isOut ? edge.target : edge.source;
              const other = nodeMap.get(otherId);
              return (
                <EdgeButton key={i} edge={edge} other={other} isOutgoing={isOut} onClick={navigateToNode} />
              );
            })}
          </div>
        ),
      });
    }

    return sections;
  }, [selectedNode, selectedEdges, nodeMap, navigateToNode]);

  return (
    <div className="relative h-full bg-[#050505]" ref={containerRef}>
      {/* Ambient glow overlays */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute w-[800px] h-[800px] rounded-full"
          style={{
            top: '10%',
            left: '15%',
            background: 'radial-gradient(circle, rgba(245,158,11,0.06), transparent 70%)',
          }}
        />
        <div
          className="absolute w-[600px] h-[600px] rounded-full"
          style={{
            bottom: '20%',
            right: '10%',
            background: 'radial-gradient(circle, rgba(245,158,11,0.06), transparent 70%)',
          }}
        />
        <div
          className="absolute w-[700px] h-[700px] rounded-full"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(245,158,11,0.06), transparent 70%)',
          }}
        />
      </div>

      {/* Force Graph */}
      {dimensions.width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#050505"
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            const r = getNodeRadius(node as FGNode) + 4;
            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, r, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          onNodeClick={handleNodeClick}
          onNodeHover={(node: any) => setHoveredNode(node as FGNode | null)}
          onLinkHover={(link: any) => setHoveredEdge(link as FGLink | null)}
          onZoom={(t: any) => handleZoom({ k: t.k, x: t.x, y: t.y })}
          linkCanvasObject={paintLink}
          linkDirectionalArrowLength={0}
          // Slow decay → simulation runs longer → nodes spread further
          d3AlphaMin={0.003}
          d3AlphaDecay={0.006}
          d3VelocityDecay={0.12}
          cooldownTicks={500}
          warmupTicks={100}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          minZoom={0.2}
          maxZoom={10}
        />
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 glass-2 rounded-xl p-3">
        {Object.entries(TYPE_COLORS).map(([type, color]) => {
          const Icon = TYPE_ICONS[type];
          const isActive = filterType === type;
          const labelDict = locale === 'zh' ? TYPE_LABELS_ZH : TYPE_LABELS;

          return (
            <button
              key={type}
              onClick={() => setFilterType(isActive ? null : type)}
              className="flex items-center gap-1.5 transition-all hover:scale-105"
            >
              <span
                className={`w-[6px] h-[6px] rounded-full transition-all ${isActive ? 'ring-2 ring-[#f59e0b] ring-offset-2 ring-offset-[#050505]' : ''}`}
                style={{ backgroundColor: color }}
              />
              {Icon && <Icon className="w-3.5 h-3.5" style={{ color }} />}
              <span className="text-[11px] text-[var(--text-secondary)]">{labelDict[type] || type}</span>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="absolute top-4 left-4 glass-1 rounded-full px-3 py-1.5">
        <span className="text-[12px] text-[var(--text-muted)]">
          {filterType ? graphData.nodes.length : data.nodes.length} nodes &middot; {filterType ? graphData.links.length : data.edges.length} edges
        </span>
      </div>

      {/* ---- Floating Popup Card ---- */}
      {selectedNode && popupPos && popupSections && (
        <div
          ref={popupRef}
          className="absolute z-50 w-[420px] max-h-[70vh] overflow-hidden glass-3 rounded-2xl shadow-lg flex flex-col"
          style={{ left: popupPos.x, top: popupPos.y }}
        >
          {/* Popup header */}
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
                    {(locale === 'zh' ? TYPE_LABELS_ZH : TYPE_LABELS)[selectedNode.type] || selectedNode.type}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { setSelectedNode(null); setPopupPos(null); }}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Popup body — scrollable sections */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {popupSections.map((section, i) => {
              const SIcon = section.icon;
              return (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <SIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <h3 className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
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
// Edge button — reusable for connection lists
// ---------------------------------------------------------------------------

function EdgeButton({
  edge,
  other,
  isOutgoing,
  onClick,
}: {
  edge: GraphEdge;
  other: FGNode | undefined;
  isOutgoing: boolean;
  onClick: (id: string) => void;
}) {
  const otherId = isOutgoing ? edge.target : edge.source;
  const otherColor = other ? getColor(other.type) : DEFAULT_COLOR;

  return (
    <button
      onClick={() => onClick(otherId)}
      className="w-full flex items-center gap-2.5 text-xs py-2 px-3 rounded-lg glass-1 hover:bg-[var(--bg-elevated)] transition-colors text-left group"
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: otherColor }}
      />
      <div className="flex-1 min-w-0">
        <span className="text-[var(--text-primary)] block truncate group-hover:text-[var(--text-primary)]">
          {other?.label || otherId}
        </span>
        <span className="text-[var(--text-muted)] text-[10px]">
          {other ? TYPE_LABELS_ZH[other.type] || other.type : "unknown"}
        </span>
      </div>
      <span className="text-[var(--text-muted)] flex-shrink-0 text-[10px] glass-1 px-2 py-0.5 rounded-full">
        {isOutgoing ? "\u2192" : "\u2190"} {EDGE_LABELS[edge.type] || edge.type}
      </span>
      <ExternalLink className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}
