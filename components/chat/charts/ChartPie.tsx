"use client";

const PIE_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
];

interface PieItem {
  category: string;
  value: number;
}

interface PieData {
  type: "pie";
  title?: string;
  data: PieItem[];
}

export function ChartPie({ chart }: { chart: PieData }) {
  const total = chart.data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 60;
  const CX = 80;
  const CY = 80;
  const circumference = 2 * Math.PI * R;

  let accumulated = 0;
  const slices = chart.data.map((item, i) => {
    const pct = item.value / total;
    const dashLen = pct * circumference;
    const dashOffset = -accumulated * circumference;
    accumulated += pct;
    return { ...item, pct, dashLen, dashOffset, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-zinc-300">
          {chart.title}
        </div>
      )}
      <div className="flex items-center gap-6 px-4 pb-3">
        <svg width="160" height="160" viewBox="0 0 160 160" className="flex-shrink-0">
          {slices.map((s, i) => (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="30"
              strokeDasharray={`${s.dashLen} ${circumference - s.dashLen}`}
              strokeDashoffset={s.dashOffset}
              transform={`rotate(-90 ${CX} ${CY})`}
              className="transition-all duration-500"
            />
          ))}
        </svg>
        <div className="space-y-1.5 min-w-0">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-zinc-400 truncate">{s.category}</span>
              <span className="text-zinc-500 ml-auto flex-shrink-0">
                {Math.round(s.pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
