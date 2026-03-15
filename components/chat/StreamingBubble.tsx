"use client";

import { Loader2, Check, X } from "lucide-react";
import type { StreamingSection } from "@/store/slices/chatSlice";

export function StreamingBubble({ sections }: { sections: StreamingSection[] }) {
  if (sections.length === 0) return null;
  return (
    <div className="mr-auto max-w-[85%]">
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="text-[11px] font-medium text-zinc-500">RebuilD</span>
      </div>
      <div className="rounded-2xl px-4 py-3 bg-zinc-900/60 border border-zinc-800/50">
        {sections.map((section, i) => (
          <StreamingSectionView
            key={i}
            section={section}
            isLast={i === sections.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function StreamingSectionView({
  section,
  isLast,
}: {
  section: StreamingSection;
  isLast: boolean;
}) {
  if (section.type === "text") {
    return (
      <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words">
        {section.content}
        {isLast && (
          <span className="inline-block w-0.5 h-4 bg-zinc-400 animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    );
  }

  // tool_call — inline card
  return (
    <div className="my-2 py-1.5 px-3 rounded-lg bg-zinc-800/40 border border-zinc-700/30">
      <div className="flex items-center gap-2 text-xs">
        {section.status === "running" && (
          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
        )}
        {section.status === "success" && (
          <Check className="w-3 h-3 text-emerald-400" />
        )}
        {section.status === "error" && (
          <X className="w-3 h-3 text-red-400" />
        )}
        <span className="text-zinc-300 font-medium">{section.toolLabel}</span>
        {section.args && (
          <span className="text-zinc-600 truncate max-w-[250px]">
            {section.args}
          </span>
        )}
      </div>
      {section.resultPreview && (
        <div className="mt-1 text-[11px] text-zinc-500 truncate pl-5">
          └ {section.resultPreview}
        </div>
      )}
    </div>
  );
}
