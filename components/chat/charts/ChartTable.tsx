"use client";

interface TableData {
  type: "table";
  title?: string;
  columns: string[];
  data: string[][];
}

export function ChartTable({ chart }: { chart: TableData }) {
  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-zinc-300">
          {chart.title}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-700/60">
              {chart.columns.map((col, i) => (
                <th
                  key={i}
                  className="px-4 py-2 text-left font-medium text-zinc-400 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.data.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/30 transition-colors"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-4 py-2 whitespace-nowrap ${
                      ci === 0 ? "text-zinc-300 font-medium" : "text-zinc-400"
                    }`}
                  >
                    {cell}
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
