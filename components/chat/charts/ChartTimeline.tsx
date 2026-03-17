"use client";

interface TimelineItem {
  period: string;
  events: string;
  revenue?: string;
  [key: string]: string | undefined;
}

interface TimelineData {
  type: "timeline";
  title?: string;
  data: TimelineItem[];
}

export function ChartTimeline({ chart }: { chart: TimelineData }) {
  return (
    <div>
      {chart.title && (
        <div className="px-4 pt-3 pb-2 text-sm font-medium text-zinc-300">
          {chart.title}
        </div>
      )}
      <div className="px-4 pb-3">
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-700/60" />

          {chart.data.map((item, i) => (
            <div key={i} className="relative pb-4 last:pb-0">
              {/* Dot */}
              <div className="absolute left-[-17px] top-1.5 w-3 h-3 rounded-full border-2 border-blue-500 bg-zinc-900" />

              <div className="ml-1">
                <div className="text-xs font-medium text-blue-400">{item.period}</div>
                <div className="text-xs text-zinc-300 mt-0.5">{item.events}</div>
                {item.revenue && (
                  <div className="text-[11px] text-zinc-500 mt-0.5">{item.revenue}</div>
                )}
                {/* Render any extra fields */}
                {Object.entries(item)
                  .filter(([k]) => !["period", "events", "revenue"].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="text-[11px] text-zinc-500 mt-0.5">
                      {k}: {v}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
