"use client";

interface RatingItem {
  dimension: string;
  score?: number;
  max?: number;
  level?: string;
  note?: string;
}

interface RatingData {
  type: "rating";
  title?: string;
  ratings: RatingItem[];
}

function StarRow({ score, max }: { score: number; max: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={i < score ? "text-amber-400" : "text-zinc-700"}
        >
          <path
            d="M6 1 L7.5 4 L11 4.5 L8.5 6.8 L9.1 10.2 L6 8.5 L2.9 10.2 L3.5 6.8 L1 4.5 L4.5 4 Z"
            fill="currentColor"
          />
        </svg>
      ))}
    </div>
  );
}

export function ChartRating({ chart }: { chart: RatingData }) {
  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-zinc-300">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3 space-y-2.5">
        {chart.ratings.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-800/20 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-zinc-300">{item.dimension}</div>
              {item.note && (
                <div className="text-[11px] text-zinc-500 mt-0.5">{item.note}</div>
              )}
            </div>
            <div className="flex-shrink-0">
              {item.score != null && item.max != null ? (
                <div className="flex items-center gap-2">
                  <StarRow score={item.score} max={item.max} />
                  <span className="text-xs text-zinc-500">
                    {item.score}/{item.max}
                  </span>
                </div>
              ) : item.level ? (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    item.level === "高" || item.level === "High"
                      ? "bg-red-500/15 text-red-400"
                      : item.level === "中" || item.level === "Medium"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-emerald-500/15 text-emerald-400"
                  }`}
                >
                  {item.level}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
