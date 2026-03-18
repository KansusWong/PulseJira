"use client";

import { Search } from "lucide-react";
import { usePulseStore } from "@/store/usePulseStore.new";
import { ContextWindowIndicator } from "@/components/chat/ContextWindowIndicator";

export function TopBar() {
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const conversations = usePulseStore((s) => s.conversations);
  const contextUsage = usePulseStore((s) => s.contextUsage);

  // Find active conversation
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const title = activeConversation?.title;

  // Show indicator only when token usage > 50%
  const showIndicator = contextUsage && contextUsage.ratio > 0.5;
  const isWarning = contextUsage && contextUsage.ratio > 0.8;

  return (
    <div className="h-12 flex-shrink-0 border-b border-[rgba(255,255,255,0.04)] flex items-center justify-between px-4">
      {/* Left: conversation title */}
      <div className="flex-1 min-w-0">
        {title ? (
          <h1 className="text-sm text-[var(--text-secondary)] truncate">
            {title}
          </h1>
        ) : null}
      </div>

      {/* Right: context indicator + search button */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Context window indicator — text format */}
        {showIndicator && contextUsage && (
          <div
            className={
              isWarning
                ? "text-[var(--accent)] text-xs"
                : "text-[var(--text-muted)] text-xs"
            }
          >
            {Math.round(contextUsage.estimated / 1000)}k / {Math.round(contextUsage.max / 1000)}k
          </div>
        )}

        {/* Search button */}
        <button
          type="button"
          className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
