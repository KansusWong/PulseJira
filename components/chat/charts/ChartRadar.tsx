"use client";

const RADAR_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
];

interface RadarSeries {
  name: string;
  data: number[];
}

interface RadarData {
  type: "radar";
  title?: string;
  dimensions: string[];
  series: RadarSeries[];
}

export function ChartRadar({ chart }: { chart: RadarData }) {
  const dims = chart.dimensions;
  const n = dims.length;
  if (n < 3) return null; // Radar needs at least 3 dimensions

  const CX = 120;
  const CY = 120;
  const R = 80;
  const maxVal = Math.max(
    ...chart.series.flatMap((s) => s.data),
    10
  );

  // Angle for each dimension (starting from top, going clockwise)
  const angles = dims.map((_, i) => (Math.PI * 2 * i) / n - Math.PI / 2);

  function polarToXY(angle: number, radius: number) {
    return {
      x: CX + Math.cos(angle) * radius,
      y: CY + Math.sin(angle) * radius,
    };
  }

  // Grid rings (3 levels)
  const rings = [0.33, 0.66, 1];

  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-[var(--text-primary)]">
          {chart.title}
        </div>
      )}
      <div className="flex items-center gap-6 px-4 pb-3">
        <svg width="240" height="240" viewBox="0 0 240 240" className="flex-shrink-0">
          {/* Grid rings */}
          {rings.map((ratio, ri) => {
            const points = angles
              .map((a) => polarToXY(a, R * ratio))
              .map((p) => `${p.x},${p.y}`)
              .join(" ");
            return (
              <polygon
                key={ri}
                points={points}
                fill="none"
                stroke="rgba(113,113,122,0.2)"
                strokeWidth="1"
              />
            );
          })}

          {/* Axis lines */}
          {angles.map((a, i) => {
            const p = polarToXY(a, R);
            return (
              <line
                key={i}
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke="rgba(113,113,122,0.15)"
                strokeWidth="1"
              />
            );
          })}

          {/* Data polygons */}
          {chart.series.map((series, si) => {
            const color = RADAR_COLORS[si % RADAR_COLORS.length];
            const points = series.data
              .map((val, i) => polarToXY(angles[i], (val / maxVal) * R))
              .map((p) => `${p.x},${p.y}`)
              .join(" ");
            return (
              <g key={si}>
                <polygon
                  points={points}
                  fill={color}
                  fillOpacity="0.15"
                  stroke={color}
                  strokeWidth="1.5"
                />
                {series.data.map((val, i) => {
                  const p = polarToXY(angles[i], (val / maxVal) * R);
                  return <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />;
                })}
              </g>
            );
          })}

          {/* Dimension labels */}
          {dims.map((dim, i) => {
            const p = polarToXY(angles[i], R + 16);
            return (
              <text
                key={i}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] fill-[var(--text-secondary)]"
              >
                {dim}
              </text>
            );
          })}
        </svg>

        {/* Legend */}
        {chart.series.length > 1 && (
          <div className="space-y-1.5 min-w-0">
            {chart.series.map((s, si) => (
              <div key={si} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: RADAR_COLORS[si % RADAR_COLORS.length] }}
                />
                <span className="text-[var(--text-secondary)] truncate">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
