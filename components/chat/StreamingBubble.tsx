"use client";

import { Loader2, Check, X } from "lucide-react";
import type { StreamingSection } from "@/store/slices/chatSlice";

export function StreamingBubble({ sections }: { sections: StreamingSection[] }) {
  if (sections.length === 0) return null;
  return (
    <div className="mr-auto max-w-[85%]">
      <div className="px-1 py-1">
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
      <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words">
        {section.content}
        {isLast && (
          <span className="inline-block w-0.5 h-4 bg-zinc-600 animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    );
  }

  // tool_call — minimal inline indicator
  return (
    <div className="my-1.5 py-1 px-2">
      <div className="flex items-center gap-2 text-xs">
        {section.status === "running" && (
          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
        )}
        {section.status === "success" && (
          <Check className="w-3 h-3 text-emerald-500/70" />
        )}
        {section.status === "error" && (
          <X className="w-3 h-3 text-red-400/70" />
        )}
        <span className="text-zinc-400 font-medium">{section.toolLabel}</span>
        {section.args && (
          <span className="text-zinc-600 truncate max-w-[250px]">
            {section.args}
          </span>
        )}
      </div>
      {section.resultPreview && (
        <div className="mt-0.5 text-[11px] text-zinc-600 truncate pl-5">
          {section.resultPreview}
        </div>
      )}
    </div>
  );
}
