"use client";

interface MetricItem {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down";
}

interface MetricsData {
  type: "metrics";
  title?: string;
  data: MetricItem[];
}

export function ChartMetrics({ chart }: { chart: MetricsData }) {
  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-[var(--text-primary)]">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {chart.data.map((item, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-3 py-2.5"
          >
            <div className="text-[11px] text-[var(--text-muted)] mb-1">{item.label}</div>
            <div className="text-lg font-semibold text-[var(--text-primary)]">{item.value}</div>
            {item.change && (
              <div className="flex items-center gap-1 mt-0.5">
                {item.trend === "up" && (
                  <svg width="10" height="10" viewBox="0 0 10 10" className="text-emerald-400">
                    <path d="M5 2 L8 6 L2 6 Z" fill="currentColor" />
                  </svg>
                )}
                {item.trend === "down" && (
                  <svg width="10" height="10" viewBox="0 0 10 10" className="text-red-400">
                    <path d="M5 8 L8 4 L2 4 Z" fill="currentColor" />
                  </svg>
                )}
                <span
                  className={`text-[11px] font-medium ${
                    item.trend === "up"
                      ? "text-emerald-400"
                      : item.trend === "down"
                      ? "text-red-400"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {item.change}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
