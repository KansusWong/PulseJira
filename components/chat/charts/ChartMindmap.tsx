"use client";

interface MindmapChild {
  name: string;
  children?: (string | MindmapChild)[];
}

interface MindmapData {
  type: "mindmap";
  title?: string;
  root: string;
  children: MindmapChild[];
}

function MindmapNode({ node, depth }: { node: MindmapChild; depth: number }) {
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div className="ml-4">
      <div className="flex items-center gap-1.5 py-0.5">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            depth === 0 ? "bg-blue-400" : depth === 1 ? "bg-blue-500/60" : "bg-[var(--text-muted)]"
          }`}
        />
        <span
          className={`text-xs ${
            depth === 0 ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"
          }`}
        >
          {node.name}
        </span>
      </div>
      {hasChildren && (
        <div className="border-l border-[var(--border-subtle)] ml-[3px]">
          {node.children!.map((child, i) =>
            typeof child === "string" ? (
              <div key={i} className="ml-4 flex items-center gap-1.5 py-0.5">
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] flex-shrink-0" />
                <span className="text-xs text-[var(--text-muted)]">{child}</span>
              </div>
            ) : (
              <MindmapNode key={i} node={child} depth={depth + 1} />
            )
          )}
        </div>
      )}
    </div>
  );
}

export function ChartMindmap({ chart }: { chart: MindmapData }) {
  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-[var(--text-primary)]">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3">
        {/* Root */}
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
          <span className="text-sm font-medium text-[var(--text-primary)]">{chart.root}</span>
        </div>
        {/* Children */}
        <div className="border-l border-[var(--border-default)] ml-[3px]">
          {chart.children.map((child, i) => (
            <MindmapNode key={i} node={child} depth={0} />
          ))}
        </div>
      </div>
    </div>
  );
}
