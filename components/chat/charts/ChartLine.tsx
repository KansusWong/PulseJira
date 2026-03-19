"use client";

const LINE_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
];

interface SeriesItem {
  name: string;
  data: number[];
}

interface LineData {
  type: "line";
  title?: string;
  xAxis: string[];
  series: SeriesItem[];
}

export function ChartLine({ chart }: { chart: LineData }) {
  const allValues = chart.series.flatMap((s) => s.data);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const W = 400;
  const H = 200;
  const PX = 45; // left padding for y-axis labels
  const PY = 20; // top/bottom padding
  const plotW = W - PX - 10;
  const plotH = H - PY * 2;

  const xStep = chart.xAxis.length > 1 ? plotW / (chart.xAxis.length - 1) : plotW;

  function toPoint(xi: number, val: number) {
    const x = PX + xi * xStep;
    const y = PY + plotH - ((val - minVal) / range) * plotH;
    return { x, y };
  }

  // Y-axis ticks (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (range * i) / 4;
    const y = PY + plotH - (i / 4) * plotH;
    return { val, y };
  });

  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-[var(--text-primary)]">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3 overflow-x-auto">
        <svg width={W} height={H + 30} viewBox={`0 0 ${W} ${H + 30}`} className="w-full max-w-full">
          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={PX}
                y1={tick.y}
                x2={W - 10}
                y2={tick.y}
                stroke="rgba(113,113,122,0.2)"
                strokeDasharray="3 3"
              />
              <text
                x={PX - 6}
                y={tick.y + 3}
                textAnchor="end"
                className="text-[10px] fill-[var(--text-muted)]"
              >
                {Number.isInteger(tick.val) ? tick.val : tick.val.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {chart.xAxis.map((label, i) => {
            const x = PX + i * xStep;
            return (
              <text
                key={i}
                x={x}
                y={H + 5}
                textAnchor="middle"
                className="text-[10px] fill-[var(--text-muted)]"
              >
                {label}
              </text>
            );
          })}

          {/* Lines + dots */}
          {chart.series.map((series, si) => {
            const color = LINE_COLORS[si % LINE_COLORS.length];
            const points = series.data.map((val, xi) => toPoint(xi, val));
            const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
            return (
              <g key={si}>
                <polyline
                  points={polyline}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map((p, pi) => (
                  <circle key={pi} cx={p.x} cy={p.y} r="3" fill={color} />
                ))}
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        {chart.series.length > 1 && (
          <div className="flex items-center gap-4 mt-2 px-1">
            {chart.series.map((s, si) => (
              <div key={si} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-3 h-0.5 rounded-full"
                  style={{ backgroundColor: LINE_COLORS[si % LINE_COLORS.length] }}
                />
                <span className="text-[var(--text-secondary)]">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
