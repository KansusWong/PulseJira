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
            depth === 0 ? "bg-blue-400" : depth === 1 ? "bg-blue-500/60" : "bg-zinc-600"
          }`}
        />
        <span
          className={`text-xs ${
            depth === 0 ? "text-zinc-300 font-medium" : "text-zinc-400"
          }`}
        >
          {node.name}
        </span>
      </div>
      {hasChildren && (
        <div className="border-l border-zinc-800/60 ml-[3px]">
          {node.children!.map((child, i) =>
            typeof child === "string" ? (
              <div key={i} className="ml-4 flex items-center gap-1.5 py-0.5">
                <span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
                <span className="text-xs text-zinc-500">{child}</span>
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
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-zinc-300">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3">
        {/* Root */}
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
          <span className="text-sm font-medium text-zinc-200">{chart.root}</span>
        </div>
        {/* Children */}
        <div className="border-l border-zinc-700/60 ml-[3px]">
          {chart.children.map((child, i) => (
            <MindmapNode key={i} node={child} depth={0} />
          ))}
        </div>
      </div>
    </div>
  );
}
