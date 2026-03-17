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
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-zinc-300">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {chart.data.map((item, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800/60 bg-zinc-800/30 px-3 py-2.5"
          >
            <div className="text-[11px] text-zinc-500 mb-1">{item.label}</div>
            <div className="text-lg font-semibold text-zinc-200">{item.value}</div>
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
                      : "text-zinc-500"
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
