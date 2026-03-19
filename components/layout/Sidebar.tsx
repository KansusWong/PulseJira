"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  Settings,
  Layers,
  Trash2,
  MoreHorizontal,
  ChevronsLeft,
  Pencil,
  Sparkles,
  SquarePen,
  FolderOpen,
} from "lucide-react";
import clsx from "clsx";
import { RebuilDLogo } from "@/components/ui/RebuilDLogo";
import { useTranslation } from "@/lib/i18n";
import { usePulseStore } from "@/store/usePulseStore.new";
import { SearchModal } from "./SearchModal";

// ---------------------------------------------------------------------------
// Legacy type exports (kept for backward compat — layout.tsx imports AssetsData)
// ---------------------------------------------------------------------------

export interface SkillAsset {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  coreSkill?: boolean;
  source?: "project" | "codex" | "registry";
  created_at: string | null;
}

export interface FileAsset {
  id: string;
  name: string;
  file_path: string;
  type: string;
  project_id: string | null;
  created_at: string;
}

export interface AssetsData {
  skills: SkillAsset[];
  ppts: FileAsset[];
  files: FileAsset[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SidebarProps {
  onToggleSidebar: () => void;
  /** @deprecated assets prop is no longer used — sidebar reads from store */
  assets?: unknown;
  conversations?: Array<{ id: string; title: string | null; updated_at: string; status: string; highlighted?: boolean }>;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string | null) => void;
  onDeleteConversation?: (id: string) => void;
  onNewChat?: () => void;
  /** Callback to close mobile menu overlay (only used on mobile) */
  onCloseMobileMenu?: () => void;
}


// ---------------------------------------------------------------------------
// Context menu for conversation items
// ---------------------------------------------------------------------------

function ConversationContextMenu({
  conversationId,
  isHighlighted,
  onToggleHighlight,
  onRename,
  onDelete,
  onClose,
  anchorRef,
}: {
  conversationId: string;
  isHighlighted: boolean;
  onToggleHighlight: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-lg py-1"
    >
      <button
        onClick={() => {
          onToggleHighlight(conversationId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        {isHighlighted ? t("common.unhighlight") : t("common.highlight")}
      </button>
      <button
        onClick={() => {
          onRename(conversationId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
      >
        <Pencil className="w-3 h-3" />
        {t("common.rename")}
      </button>
      <button
        onClick={() => {
          onDelete(conversationId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-3 h-3" />
        {t("common.delete")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar({
  onToggleSidebar,
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
  onCloseMobileMenu,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  const isSidebarCollapsed = usePulseStore((s) => s.isSidebarCollapsed);
  // On mobile overlay, always show expanded. On tablet (768-1024), always collapsed. On desktop, use store state.
  const expanded = !isSidebarCollapsed;

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const contextMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const updateConversation = usePulseStore((s) => s.updateConversation);
  const toggleHighlight = usePulseStore((s) => s.toggleHighlight);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // Highlighted conversations (user-pinned), sorted by most recent
  const highlightedConversations = useMemo(
    () => conversations.filter((c) => c.highlighted).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ),
    [conversations]
  );

  // Recent conversations (non-highlighted), top 5 by updated_at
  const recentConversations = useMemo(
    () => conversations
      .filter((c) => !c.highlighted)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5),
    [conversations]
  );

  const handleNewChat = () => {
    onSelectConversation?.(null);
    onNewChat?.();
    router.push("/");
    onCloseMobileMenu?.(); // Close mobile overlay on action
  };

  const handleSelectConversation = (id: string) => {
    onSelectConversation?.(id);
    router.push("/");
    onCloseMobileMenu?.(); // Close mobile overlay on action
  };

  const handleStartRename = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    setRenamingId(id);
    setRenameValue(conv?.title || "");
  };

  const handleCommitRename = () => {
    if (renamingId && renameValue.trim()) {
      updateConversation(renamingId, { title: renameValue.trim() });
      // Also persist to server
      fetch(`/api/conversations/${renamingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameValue.trim() }),
      }).catch(() => {});
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCommitRename();
    } else if (e.key === "Escape") {
      setRenamingId(null);
      setRenameValue("");
    }
  };

  // ---- Helper: render a single conversation item (reused in Highlights & Recents) ----
  const renderConversationItem = (conv: { id: string; title: string | null; updated_at: string; status: string; highlighted?: boolean }) => {
    const isActive = activeConversationId === conv.id;
    const isRenaming = renamingId === conv.id;

    return (
      <div
        key={conv.id}
        className={clsx(
          "group/conv relative flex items-center rounded-lg transition-colors",
          isActive
            ? "border-l-2 border-[var(--accent)] bg-[var(--accent-ghost)]"
            : "border-l-2 border-transparent hover:bg-[var(--bg-hover)]",
        )}
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleCommitRename}
            onKeyDown={handleRenameKeyDown}
            className="flex-1 px-2 py-1.5 text-xs bg-transparent text-[var(--text-primary)] outline-none border border-[var(--accent)] rounded"
          />
        ) : (
          <button
            onClick={() => handleSelectConversation(conv.id)}
            className="flex-1 text-left px-3 py-2 min-w-0"
          >
            <div className="truncate text-[13px] text-[var(--text-primary)]">
              {conv.title || t("sidebar.newConversation")}
            </div>
          </button>
        )}

        {/* Context menu dots — visible on hover */}
        {!isRenaming && (
          <div className="relative flex-shrink-0 pr-1">
            <button
              ref={contextMenuId === conv.id ? contextMenuAnchorRef : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setContextMenuId(
                  contextMenuId === conv.id ? null : conv.id,
                );
              }}
              className="p-1 rounded opacity-0 group-hover/conv:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {contextMenuId === conv.id && (
              <ConversationContextMenu
                conversationId={conv.id}
                isHighlighted={!!conv.highlighted}
                onToggleHighlight={toggleHighlight}
                onRename={handleStartRename}
                onDelete={(id) => onDeleteConversation?.(id)}
                onClose={() => setContextMenuId(null)}
                anchorRef={contextMenuAnchorRef}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  // ---- COLLAPSED STATE ----
  if (!expanded) {
    return (
      <div
        className="flex flex-col h-full bg-[var(--bg-surface)] items-center py-2 gap-1"
        aria-expanded="false"
      >
        {/* Logo: cyan square — click to expand */}
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 rounded-lg bg-zinc-200 flex items-center justify-center flex-shrink-0 hover:bg-zinc-300 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none"
          title={t("sidebar.openSidebar")}
          aria-label={t("sidebar.openSidebar")}
        >
          <RebuilDLogo className="w-4 h-4 text-black" />
        </button>

        {/* New Chat: 34px square "+" button */}
        <button
          onClick={handleNewChat}
          className="w-[34px] h-[34px] rounded-lg border border-[var(--accent)] text-[var(--accent)] flex items-center justify-center hover:bg-[var(--accent-ghost)] transition-colors flex-shrink-0 mt-2 focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none"
          title={t("sidebar.newChat")}
          aria-label={t("sidebar.newChat")}
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Projects icon button */}
        <button
          onClick={() => router.push("/projects")}
          className={clsx(
            "w-[34px] h-[34px] rounded-lg flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none mt-2",
            pathname === "/projects" || pathname.startsWith("/projects/")
              ? "text-[var(--accent)] bg-[var(--accent-ghost)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          )}
          title={t("sidebar.projects")}
          aria-label={t("sidebar.projects")}
        >
          <FolderOpen className="w-4 h-4" />
        </button>

        {/* Knowledge Graph icon button */}
        <button
          onClick={() => router.push("/graph")}
          className={clsx(
            "w-[34px] h-[34px] rounded-lg flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none mt-1",
            pathname === "/graph"
              ? "text-[var(--accent)] bg-[var(--accent-ghost)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
          )}
          title={t("sidebar.graph")}
          aria-label={t("sidebar.graph")}
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom nav: Settings only */}
        <div className="flex flex-col items-center gap-1 mt-auto pt-2 border-t border-[var(--border-subtle)] w-full">
          <button
            onClick={() => router.push("/settings")}
            className={clsx(
              "w-[34px] h-[34px] rounded-lg flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none",
              pathname === "/settings"
                ? "text-[var(--accent)] bg-[var(--accent-ghost)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
            )}
            title={t("sidebar.settings")}
            aria-label={t("sidebar.settings")}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ---- EXPANDED STATE (220px) ----
  return (
    <div
      className="flex flex-col h-full bg-[var(--bg-surface)]"
      aria-expanded="true"
    >
      {/* Logo bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-200 flex items-center justify-center flex-shrink-0">
            <RebuilDLogo className="w-4 h-4 text-black" />
          </div>
          <span className="text-[15px] font-semibold text-[var(--text-primary)]">
            RebuilD
          </span>
        </div>
        <button
          onClick={onToggleSidebar}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] focus-visible:outline-none"
          title={t("sidebar.closeSidebar")}
          aria-label={t("sidebar.closeSidebar")}
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Action group: New Chat, Search, Projects, Graph */}
      <div className="px-3 pt-3 pb-1 space-y-1">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
        >
          <SquarePen className="w-[18px] h-[18px] flex-shrink-0" />
          <span>{t("sidebar.newChat")}</span>
        </button>
        <button
          onClick={() => setSearchModalOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
        >
          <Search className="w-[18px] h-[18px] flex-shrink-0" />
          <span>{t("sidebar.searchChats")}</span>
        </button>
        <button
          onClick={() => { router.push("/projects"); onCloseMobileMenu?.(); }}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-lg transition-colors",
            pathname === "/projects" || pathname.startsWith("/projects/")
              ? "text-[var(--accent)] bg-[var(--accent-ghost)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          )}
        >
          <FolderOpen className="w-[18px] h-[18px] flex-shrink-0" />
          <span>{t("sidebar.projects")}</span>
        </button>
        <button
          onClick={() => router.push("/graph")}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-lg transition-colors",
            pathname === "/graph"
              ? "text-[var(--accent)] bg-[var(--accent-ghost)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
          )}
        >
          <Layers className="w-[18px] h-[18px] flex-shrink-0" />
          <span>{t("sidebar.graph")}</span>
        </button>
      </div>

      {/* Conversation list: Highlights + Recents */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 scrollbar-thin">
        {loadingConversations ? (
          <div className="space-y-2 px-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-[36px] rounded-md shimmer"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Highlights */}
            {highlightedConversations.length > 0 && (
              <div className="mb-2">
                <div className="px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-medium select-none">
                  {t("sidebar.highlights")}
                </div>
                <div className="space-y-0.5">
                  {highlightedConversations.map((conv) => renderConversationItem(conv))}
                </div>
              </div>
            )}

            {/* Recents */}
            {recentConversations.length > 0 && (
              <div className="mb-2">
                <div className="px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-medium select-none">
                  {t("sidebar.recents")}
                </div>
                <div className="space-y-0.5">
                  {recentConversations.map((conv) => renderConversationItem(conv))}
                </div>
              </div>
            )}

            {highlightedConversations.length === 0 && recentConversations.length === 0 && (
              <div className="px-3 py-6 text-center">
                <p className="text-xs text-[var(--text-muted)]">{t("sidebar.newConversation")}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom nav: Settings */}
      <div className="border-t border-[var(--border-subtle)] px-3 py-2.5">
        <button
          onClick={() => router.push("/settings")}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-lg transition-colors",
            pathname === "/settings"
              ? "text-[var(--accent)] bg-[var(--accent-ghost)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
          )}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <span>{t("sidebar.settings")}</span>
        </button>
      </div>

      {/* Search modal */}
      {searchModalOpen && (
        <SearchModal
          conversations={conversations}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onClose={() => setSearchModalOpen(false)}
        />
      )}
    </div>
  );
}
