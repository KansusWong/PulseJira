"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface PageSwitcherProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  labels?: string[];
}

export function PageSwitcher({ currentPage, totalPages, onPageChange, labels }: PageSwitcherProps) {
  const hasPrev = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;

  return (
    <div className="flex items-center gap-0.5 py-2 px-4 border-b border-border bg-zinc-950/80 backdrop-blur-sm">
      <button
        onClick={() => hasPrev && onPageChange(currentPage - 1)}
        disabled={!hasPrev}
        className={clsx(
          "p-1 rounded-md transition-colors",
          hasPrev
            ? "text-zinc-400 hover:text-white hover:bg-zinc-800"
            : "text-zinc-800 cursor-not-allowed"
        )}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => hasNext && onPageChange(currentPage + 1)}
        disabled={!hasNext}
        className={clsx(
          "p-1 rounded-md transition-colors",
          hasNext
            ? "text-zinc-400 hover:text-white hover:bg-zinc-800"
            : "text-zinc-800 cursor-not-allowed"
        )}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      {labels && labels.length > 0 && (
        <div className="flex items-center gap-0.5 ml-2">
          {labels.map((label, i) => (
            <button
              key={i}
              onClick={() => onPageChange(i)}
              className={clsx(
                "text-[10px] font-mono px-2 py-0.5 rounded transition-colors",
                currentPage === i
                  ? "bg-zinc-800 text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-400"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <span className="ml-2 text-[10px] text-zinc-600 font-mono">{currentPage + 1}/{totalPages}</span>
    </div>
  );
}
