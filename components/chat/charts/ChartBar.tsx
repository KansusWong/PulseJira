"use client";

const BAR_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
];

interface BarItem {
  category: string;
  value: number;
}

interface BarData {
  type: "bar";
  title?: string;
  data: BarItem[];
}

export function ChartBar({ chart }: { chart: BarData }) {
  const maxVal = Math.max(...chart.data.map((d) => d.value), 1);

  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-[var(--text-primary)]">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3 space-y-2.5">
        {chart.data.map((item, i) => {
          const pct = (item.value / maxVal) * 100;
          const color = BAR_COLORS[i % BAR_COLORS.length];
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--text-secondary)]">{item.category}</span>
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  {item.value}
                </span>
              </div>
              <div className="h-5 w-full rounded-sm bg-[var(--bg-glass)] overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color}cc, ${color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
