"use client";

interface ComparisonItem {
  dimension: string;
  [key: string]: string;
}

interface ComparisonData {
  type: "comparison";
  title?: string;
  items: ComparisonItem[];
}

export function ChartComparison({ chart }: { chart: ComparisonData }) {
  // Extract column names from items (all keys except "dimension")
  const columns = chart.items.length > 0
    ? Object.keys(chart.items[0]).filter((k) => k !== "dimension")
    : [];

  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-[var(--text-primary)]">
          {chart.title}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border-default)]">
              <th className="px-4 py-2 text-left font-medium text-[var(--text-muted)] whitespace-nowrap">
                维度
              </th>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-4 py-2 text-left font-medium text-blue-400 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.items.map((item, ri) => (
              <tr
                key={ri}
                className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
              >
                <td className="px-4 py-2 text-[var(--text-primary)] font-medium whitespace-nowrap">
                  {item.dimension}
                </td>
                {columns.map((col, ci) => (
                  <td key={ci} className="px-4 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                    {item[col] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
