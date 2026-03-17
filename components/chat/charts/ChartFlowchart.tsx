"use client";

interface FlowNode {
  id: string;
  label: string;
  description?: string;
  children?: string[];
}

interface FlowchartData {
  type: "flowchart";
  title?: string;
  nodes: FlowNode[];
}

export function ChartFlowchart({ chart }: { chart: FlowchartData }) {
  // Build node lookup
  const nodeMap = new Map(chart.nodes.map((n) => [n.id, n]));
  // Find root nodes (not referenced as a child)
  const childSet = new Set(chart.nodes.flatMap((n) => n.children ?? []));
  const roots = chart.nodes.filter((n) => !childSet.has(n.id));

  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-zinc-300">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3">
        {roots.map((root) => (
          <FlowTree key={root.id} nodeId={root.id} nodeMap={nodeMap} depth={0} />
        ))}
      </div>
    </div>
  );
}

function FlowTree({
  nodeId,
  nodeMap,
  depth,
}: {
  nodeId: string;
  nodeMap: Map<string, FlowNode>;
  depth: number;
}) {
  const node = nodeMap.get(nodeId);
  if (!node) return null;

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={`inline-flex flex-col rounded-lg border px-3 py-2 mb-2 ${
          depth === 0
            ? "border-blue-500/40 bg-blue-500/10"
            : "border-zinc-700/60 bg-zinc-800/30"
        }`}
      >
        <span className="text-xs font-medium text-zinc-200">{node.label}</span>
        {node.description && (
          <span className="text-[11px] text-zinc-500 mt-0.5">{node.description}</span>
        )}
      </div>

      {hasChildren && (
        <div className="flex gap-3 ml-4 pl-3 border-l border-zinc-700/40">
          {node.children!.map((childId) => (
            <FlowTree key={childId} nodeId={childId} nodeMap={nodeMap} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
