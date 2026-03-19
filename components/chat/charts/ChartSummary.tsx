"use client";

interface InsightItem {
  title: string;
  description: string;
}

interface SummaryData {
  type: "summary";
  title?: string;
  insights: InsightItem[];
}

export function ChartSummary({ chart }: { chart: SummaryData }) {
  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-[var(--text-primary)]">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3 space-y-2">
        {chart.insights.map((item, i) => (
          <div
            key={i}
            className="flex gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-3 py-2.5"
          >
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 10 10" className="text-blue-400">
                  <path
                    d="M5 1 L6.5 3.5 L9.5 4 L7.25 6.1 L7.8 9 L5 7.5 L2.2 9 L2.75 6.1 L0.5 4 L3.5 3.5 Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--text-primary)]">{item.title}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
