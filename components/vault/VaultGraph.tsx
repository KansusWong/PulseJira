"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import {
  Network,
  Bot,
  Target,
  FileText,
  Code,
  Wrench,
  Layers,
  Presentation,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types (matches API response)
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

// ---------------------------------------------------------------------------
// Node type config
// ---------------------------------------------------------------------------

const NODE_TYPE_CONFIG: Record<string, {
  icon: typeof Network;
  color: string;
  bg: string;
  label: string;
}> = {
  mate:    { icon: Bot,          color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Mates' },
  mission: { icon: Target,       color: 'text-blue-400',    bg: 'bg-blue-400/10',    label: 'Missions' },
  doc:     { icon: FileText,     color: 'text-amber-400',   bg: 'bg-amber-400/10',   label: 'Documents' },
  code:    { icon: Code,         color: 'text-purple-400',  bg: 'bg-purple-400/10',  label: 'Code' },
  skill:   { icon: Layers,       color: 'text-cyan-400',    bg: 'bg-cyan-400/10',    label: 'Skills' },
  tool:    { icon: Wrench,       color: 'text-orange-400',  bg: 'bg-orange-400/10',  label: 'Tools' },
  pptx:    { icon: Presentation, color: 'text-pink-400',    bg: 'bg-pink-400/10',    label: 'Presentations' },
  epic:    { icon: Target,       color: 'text-indigo-400',  bg: 'bg-indigo-400/10',  label: 'Epics' },
  task:    { icon: Target,       color: 'text-teal-400',    bg: 'bg-teal-400/10',    label: 'Tasks' },
};

const DEFAULT_CONFIG = { icon: FileText, color: 'text-zinc-400', bg: 'bg-zinc-400/10', label: 'Other' };

// ---------------------------------------------------------------------------
// Edge type labels
// ---------------------------------------------------------------------------

const EDGE_LABELS: Record<string, string> = {
  produced:      'produced',
  depends_on:    'depends on',
  reuses:        'reuses',
  part_of:       'part of',
  supersedes:    'supersedes',
  participated:  'participated in',
  led:           'led',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaultGraph({ data }: { data: GraphData }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['mate', 'mission']));
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Group nodes by type
  const grouped = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    for (const node of data.nodes) {
      const type = node.type || 'other';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(node);
    }
    // Sort groups: mate first, then mission, then by count desc
    const priority = ['mate', 'mission', 'doc', 'code', 'skill', 'tool', 'pptx', 'epic', 'task'];
    return [...groups.entries()].sort((a, b) => {
      const ai = priority.indexOf(a[0]);
      const bi = priority.indexOf(b[0]);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b[1].length - a[1].length;
    });
  }, [data.nodes]);

  // Edges for selected node
  const selectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return data.edges.filter(e => e.source === selectedNode || e.target === selectedNode);
  }, [selectedNode, data.edges]);

  // Node lookup
  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data.nodes]);

  const toggleGroup = (type: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="flex h-full">
      {/* Left: Node groups */}
      <div className="w-[360px] border-r border-zinc-800/50 overflow-y-auto">
        {grouped.map(([type, nodes]) => {
          const config = NODE_TYPE_CONFIG[type] || DEFAULT_CONFIG;
          const Icon = config.icon;
          const expanded = expandedGroups.has(type);

          return (
            <div key={type}>
              <button
                onClick={() => toggleGroup(type)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-zinc-800/30 transition-colors"
              >
                {expanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                }
                <Icon className={clsx("w-4 h-4", config.color)} />
                <span className="font-medium text-zinc-300">{config.label}</span>
                <span className="ml-auto text-xs text-zinc-600">{nodes.length}</span>
              </button>

              {expanded && (
                <div className="pb-1">
                  {nodes.map(node => (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                      className={clsx(
                        "w-full flex items-center gap-2 px-8 py-1.5 text-sm transition-colors text-left",
                        node.id === selectedNode
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
                      )}
                    >
                      <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", config.bg, config.color.replace('text-', 'bg-'))} />
                      <span className="truncate">{node.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {grouped.length === 0 && (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">
            No data
          </div>
        )}
      </div>

      {/* Right: Detail panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedNode ? (
          <NodeDetail
            node={nodeMap.get(selectedNode)!}
            edges={selectedEdges}
            nodeMap={nodeMap}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600">
            <Network className="w-10 h-10" />
            <p className="text-sm">Select a node to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node detail panel
// ---------------------------------------------------------------------------

function NodeDetail({
  node,
  edges,
  nodeMap,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
}) {
  const config = NODE_TYPE_CONFIG[node.type] || DEFAULT_CONFIG;
  const Icon = config.icon;

  const outgoing = edges.filter(e => e.source === node.id);
  const incoming = edges.filter(e => e.target === node.id);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", config.bg)}>
          <Icon className={clsx("w-5 h-5", config.color)} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{node.label}</h2>
          <p className="text-xs text-zinc-500">{node.type} · {node.id}</p>
        </div>
      </div>

      {/* Metadata */}
      {node.metadata && Object.keys(node.metadata).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-400">Metadata</h3>
          <div className="bg-zinc-900 rounded-lg p-3 space-y-1.5">
            {Object.entries(node.metadata).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-sm">
                <span className="text-zinc-500 min-w-[120px]">{key}</span>
                <span className="text-zinc-300 break-all">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing edges */}
      {outgoing.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-400">
            Outgoing ({outgoing.length})
          </h3>
          <div className="space-y-1">
            {outgoing.map((edge, i) => {
              const target = nodeMap.get(edge.target);
              const targetConfig = target ? (NODE_TYPE_CONFIG[target.type] || DEFAULT_CONFIG) : DEFAULT_CONFIG;
              return (
                <div key={i} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-zinc-800/30">
                  <span className="text-zinc-500">{EDGE_LABELS[edge.type] || edge.type}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-600" />
                  <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", targetConfig.color.replace('text-', 'bg-'))} />
                  <span className="text-zinc-300">{target?.label || edge.target}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Incoming edges */}
      {incoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-400">
            Incoming ({incoming.length})
          </h3>
          <div className="space-y-1">
            {incoming.map((edge, i) => {
              const source = nodeMap.get(edge.source);
              const sourceConfig = source ? (NODE_TYPE_CONFIG[source.type] || DEFAULT_CONFIG) : DEFAULT_CONFIG;
              return (
                <div key={i} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-zinc-800/30">
                  <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", sourceConfig.color.replace('text-', 'bg-'))} />
                  <span className="text-zinc-300">{source?.label || edge.source}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-600" />
                  <span className="text-zinc-500">{EDGE_LABELS[edge.type] || edge.type}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {outgoing.length === 0 && incoming.length === 0 && (
        <p className="text-sm text-zinc-600">No connections</p>
      )}
    </div>
  );
}
