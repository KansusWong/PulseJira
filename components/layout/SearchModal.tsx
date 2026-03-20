"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { X, Search, SquarePen } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface SearchModalProps {
  conversations: Array<{ id: string; title: string | null; updated_at: string; status: string }>;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

function groupByTime(
  conversations: SearchModalProps["conversations"],
  t: (key: string) => string
) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  const today: typeof conversations = [];
  const yesterday: typeof conversations = [];
  const earlier: typeof conversations = [];

  for (const conv of conversations) {
    const d = new Date(conv.updated_at);
    if (d >= todayStart) today.push(conv);
    else if (d >= yesterdayStart) yesterday.push(conv);
    else earlier.push(conv);
  }

  const groups: { label: string; items: typeof conversations }[] = [];
  if (today.length) groups.push({ label: t("time.today"), items: today });
  if (yesterday.length) groups.push({ label: t("time.yesterday"), items: yesterday });
  if (earlier.length) groups.push({ label: t("time.earlier"), items: earlier });
  return groups;
}

export function SearchModal({ conversations, onSelectConversation, onNewChat, onClose }: SearchModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title && c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupByTime(filtered, t), [filtered, t]);

  const handleSelect = (id: string) => {
    onSelectConversation(id);
    onClose();
  };

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] md:left-[52px] lg:left-[260px]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-[860px] max-h-[85vh] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-subtle)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("sidebar.searchChats")}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* New Chat action */}
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          >
            <SquarePen className="w-4 h-4 text-[var(--text-secondary)]" />
            {t("sidebar.newChat")}
          </button>

          {/* Grouped conversations */}
          {groups.map((group) => (
            <div key={group.label} className="mt-2">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-medium select-none">
                {group.label}
              </div>
              {group.items.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelect(conv.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                >
                  <div className="w-5 h-5 rounded-full border border-[var(--border-subtle)] flex-shrink-0" />
                  <span className="truncate">{conv.title || t("sidebar.newConversation")}</span>
                  {conv.status === 'converted' && (
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] uppercase tracking-wide rounded bg-blue-500/10 text-blue-400 font-medium flex-shrink-0">
                      {t("sidebar.converted")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}

          {/* No results */}
          {groups.length === 0 && query && (
            <div className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">
              {t("sidebar.noMatches")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
