"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  PanelLeftClose,
  Plus,
  Search,
  Radio,
  FolderOpen,
  Settings,
  ChevronDown,
  ChevronRight,
  Target,
  Bot,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
  BarChart3,
  Wrench,
  Layers,
  MessageSquare,
} from "lucide-react";
import clsx from "clsx";
import type { Project } from "@/projects/types";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/settings/LanguageSwitcher";

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onToggleSidebar: () => void;
  onRenameProject?: (id: string, name: string) => void;
  onDeleteProject?: (id: string) => void;
  conversations?: Array<{ id: string; title: string | null; updated_at: string; status: string }>;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string | null) => void;
  onNewChat?: () => void;
}

const statusColors: Record<string, string> = {
  draft: "bg-zinc-500",
  analyzing: "bg-amber-500 animate-pulse",
  planned: "bg-blue-500",
  implementing: "bg-cyan-500 animate-pulse",
  implemented: "bg-indigo-500",
  deploying: "bg-emerald-500 animate-pulse",
  deployed: "bg-emerald-500",
  active: "bg-green-500",
  archived: "bg-zinc-700",
};

interface TimeGroup {
  label: string;
  projects: Project[];
}

function groupByTime(projects: Project[], t: (key: string) => string): TimeGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const monthStart = new Date(todayStart.getTime() - 30 * 86400000);

  const keys = ['time.today', 'time.yesterday', 'time.previous7days', 'time.previous30days', 'time.earlier'] as const;
  const labels = keys.map((k) => t(k));

  const buckets: Record<string, Project[]> = {
    [labels[0]]: [],
    [labels[1]]: [],
    [labels[2]]: [],
    [labels[3]]: [],
    [labels[4]]: [],
  };

  const sorted = [...projects].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  for (const p of sorted) {
    const d = new Date(p.updated_at || p.created_at);
    if (d >= todayStart) buckets[labels[0]].push(p);
    else if (d >= yesterdayStart) buckets[labels[1]].push(p);
    else if (d >= weekStart) buckets[labels[2]].push(p);
    else if (d >= monthStart) buckets[labels[3]].push(p);
    else buckets[labels[4]].push(p);
  }

  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, projects: list }));
}

function ProjectItem({
  project,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  project: Project;
  isActive: boolean;
  onSelect: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== project.name) {
      onRename?.(trimmed);
    }
    setEditing(false);
    setEditName(project.name);
  };

  const cancelRename = () => {
    setEditing(false);
    setEditName(project.name);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800/80">
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") cancelRename();
          }}
          className="flex-1 min-w-0 bg-transparent text-sm text-zinc-200 focus:outline-none"
        />
        <button onClick={commitRename} className="p-1 text-emerald-400 hover:text-emerald-300">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={cancelRename} className="p-1 text-zinc-500 hover:text-zinc-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={clsx(
          "w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm rounded-lg transition-colors",
          isActive
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
        )}
      >
        <div
          className={clsx(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            statusColors[project.status] || statusColors.draft
          )}
        />
        <span className="truncate flex-1">{project.name}</span>
      </button>

      {/* Hover menu trigger */}
      {(onRename || onDelete) && (
        <div ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className={clsx(
              "absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all",
              menuOpen
                ? "opacity-100 bg-zinc-700 text-zinc-200"
                : "opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
            )}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-36 bg-zinc-900 border border-zinc-700/60 rounded-lg shadow-xl py-1 overflow-hidden">
              {onRename && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setEditName(project.name);
                    setEditing(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {t('common.rename')}
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('common.delete')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onToggleSidebar,
  onRenameProject,
  onDeleteProject,
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [projectsFolderOpen, setProjectsFolderOpen] = useState(true);
  const [conversationsFolderOpen, setConversationsFolderOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(pathname === "/settings");

  const currentTab = searchParams.get("tab");
  const isSettingsActive = pathname === "/settings";
  const activeSettingsTab = !currentTab
    ? "setup"
    : currentTab === "preferences"
    ? "advanced-topics"
    : currentTab;

  const filteredProjects = searchQuery
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  const groups = groupByTime(filteredProjects, t);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectProject(id);
      router.push(`/projects/${id}`);
    },
    [onSelectProject, router]
  );

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Top: Toggle */}
      <div className="flex items-center px-3 pt-3 pb-1">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          title={t('sidebar.closeSidebar')}
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="px-3 pb-2">
        <button
          onClick={() => {
            onSelectConversation?.(null);
            onNewChat?.();
            router.push("/");
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <span>{t('sidebar.newChat')}</span>
        </button>
      </div>

      {/* Conversations Folder */}
      <div className="px-2 mb-1">
        <button
          onClick={() => setConversationsFolderOpen(!conversationsFolderOpen)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ChevronRight
            className={clsx(
              "w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0",
              conversationsFolderOpen && "rotate-90"
            )}
          />
          <MessageSquare className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{t('sidebar.conversations')}</span>
          <span className="ml-auto text-[10px] text-zinc-600 font-mono">
            {conversations.length}
          </span>
        </button>

        {conversationsFolderOpen && conversations.length > 0 && (
          <div className="mt-1 space-y-0.5 pl-2">
            {conversations.slice(0, 20).map((conv) => (
              <button
                key={conv.id}
                onClick={() => {
                  onSelectConversation?.(conv.id);
                  router.push("/");
                }}
                className={clsx(
                  "w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm rounded-lg transition-colors",
                  activeConversationId === conv.id
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                )}
              >
                <span className="truncate flex-1">{conv.title || t('sidebar.newConversation')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Projects Folder */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Folder header */}
        <button
          onClick={() => setProjectsFolderOpen(!projectsFolderOpen)}
          className="flex items-center gap-2.5 px-5 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ChevronRight
            className={clsx(
              "w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0",
              projectsFolderOpen && "rotate-90"
            )}
          />
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{t('sidebar.projects')}</span>
          <span className="ml-auto text-[10px] text-zinc-600 font-mono">
            {projects.length}
          </span>
        </button>

        {/* Folder content */}
        {projectsFolderOpen && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search inside folder */}
            <div className="px-3 py-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {groups.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-zinc-600">
                    {searchQuery ? t('sidebar.noMatches') : t('sidebar.noProjects')}
                  </p>
                </div>
              )}
              {groups.map((group) => (
                <div key={group.label} className="mb-2">
                  <div className="px-3 py-1">
                    <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {group.projects.map((project) => (
                      <ProjectItem
                        key={project.id}
                        project={project}
                        isActive={activeProjectId === project.id}
                        onSelect={() => handleSelect(project.id)}
                        onRename={
                          onRenameProject
                            ? (name) => onRenameProject(project.id, name)
                            : undefined
                        }
                        onDelete={
                          onDeleteProject
                            ? () => onDeleteProject(project.id)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Signals nav */}
      <div className="px-2 mb-1">
        <button
          onClick={() => router.push("/signals")}
          className={clsx(
            "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors rounded-lg",
            pathname === "/signals"
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <Radio className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{t('sidebar.signals')}</span>
        </button>
      </div>

      {/* Bottom: Settings Accordion */}
      <div className="border-t border-zinc-800/50">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={clsx(
            "w-full flex items-center gap-3 px-5 py-3 text-sm transition-colors",
            isSettingsActive
              ? "text-zinc-200"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <span>{t('sidebar.settings')}</span>
          <ChevronDown
            className={clsx(
              "w-3.5 h-3.5 ml-auto transition-transform duration-200",
              settingsOpen && "rotate-180"
            )}
          />
        </button>

        <div
          className={clsx(
            "overflow-hidden transition-all duration-300 ease-out",
            settingsOpen ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="px-2 pb-3 space-y-3">
            <div>
              <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-600">{t('sidebar.settings.initialConfig')}</div>
              <button
                onClick={() => router.push("/settings?tab=setup")}
                className={clsx(
                  "w-full flex items-center gap-3 pl-8 pr-3 py-2 text-[13px] rounded-lg transition-all duration-200",
                  isSettingsActive && activeSettingsTab === "setup"
                    ? "bg-zinc-800/90 text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                )}
              >
                <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{t('sidebar.settings.initSetup')}</span>
              </button>
            </div>

            <div>
              <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-600">{t('sidebar.settings.advancedConfig')}</div>
              <div className="space-y-0.5">
                <button
                  onClick={() => router.push("/settings?tab=advanced-platforms")}
                  className={clsx(
                    "w-full flex items-center gap-3 pl-8 pr-3 py-2 text-[13px] rounded-lg transition-all duration-200",
                    isSettingsActive && activeSettingsTab === "advanced-platforms"
                      ? "bg-zinc-800/90 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                  )}
                >
                  <Radio className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t('sidebar.settings.signalPlatforms')}</span>
                </button>
                <button
                  onClick={() => router.push("/settings?tab=advanced-topics")}
                  className={clsx(
                    "w-full flex items-center gap-3 pl-8 pr-3 py-2 text-[13px] rounded-lg transition-all duration-200",
                    isSettingsActive && activeSettingsTab === "advanced-topics"
                      ? "bg-zinc-800/90 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                  )}
                >
                  <Target className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t('sidebar.settings.interestedTopics')}</span>
                </button>
              </div>
            </div>

            <div>
              <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-zinc-600">RebuilD</div>
              <div className="space-y-0.5">
                <button
                  onClick={() => router.push("/settings?tab=llm-pool")}
                  className={clsx(
                    "w-full flex items-center gap-3 pl-8 pr-3 py-2 text-[13px] rounded-lg transition-all duration-200",
                    isSettingsActive && activeSettingsTab === "llm-pool"
                      ? "bg-zinc-800/90 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                  )}
                >
                  <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t('sidebar.settings.llmPool')}</span>
                </button>
                <button
                  onClick={() => router.push("/settings?tab=agents")}
                  className={clsx(
                    "w-full flex items-center gap-3 pl-8 pr-3 py-2 text-[13px] rounded-lg transition-all duration-200",
                    isSettingsActive && activeSettingsTab === "agents"
                      ? "bg-zinc-800/90 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                  )}
                >
                  <Bot className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t('sidebar.settings.agentManagement')}</span>
                </button>
                <button
                  onClick={() => router.push("/settings?tab=usage")}
                  className={clsx(
                    "w-full flex items-center gap-3 pl-8 pr-3 py-2 text-[13px] rounded-lg transition-all duration-200",
                    isSettingsActive && activeSettingsTab === "usage"
                      ? "bg-zinc-800/90 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t('sidebar.settings.usage')}</span>
                </button>
              </div>
            </div>

            {/* Language Switcher */}
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </div>
  );
}
