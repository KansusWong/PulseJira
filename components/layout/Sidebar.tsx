"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  PanelLeftClose,
  Plus,
  Search,
  Radio,
  Settings,
  ChevronDown,
  ChevronRight,
  Target,
  Bot,
  Trash2,
  BarChart3,
  Wrench,
  Layers,
  MessageSquare,
  Settings2,
  Bell,
  Sparkles,
  Presentation,
  FileText,
  Download,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/settings/LanguageSwitcher";
import { usePulseStore } from "@/store/usePulseStore.new";

// ---------------------------------------------------------------------------
// Asset types
// ---------------------------------------------------------------------------

export interface SkillAsset {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  source?: 'project' | 'codex' | 'registry';
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
  assets?: AssetsData | null;
  onSelectAsset?: (type: 'skill' | 'ppt' | 'file', id: string) => void;
  conversations?: Array<{ id: string; title: string | null; updated_at: string; status: string }>;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string | null) => void;
  onDeleteConversation?: (id: string) => void;
  onNewChat?: () => void;
}

type SettingsSectionKey = "initial" | "advanced" | "rebuild";

// ---------------------------------------------------------------------------
// AssetItem
// ---------------------------------------------------------------------------

function AssetItem({
  name,
  subtitle,
  icon: Icon,
  onClick,
}: {
  name: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm rounded-lg transition-colors text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
      <span className="truncate flex-1">{name}</span>
      {subtitle && (
        <span className="text-[10px] text-zinc-600 flex-shrink-0">{subtitle}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar({
  onToggleSidebar,
  assets,
  onSelectAsset,
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [conversationsFolderOpen, setConversationsFolderOpen] = useState(false);
  const [skillsFolderOpen, setSkillsFolderOpen] = useState(false);
  const [kernelGroupOpen, setKernelGroupOpen] = useState(true);
  const [customGroupOpen, setCustomGroupOpen] = useState(true);
  const [pptsFolderOpen, setPptsFolderOpen] = useState(false);
  const [filesFolderOpen, setFilesFolderOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(pathname === "/settings");
  const [openSettingsSection, setOpenSettingsSection] = useState<SettingsSectionKey | null>(null);

  const currentTab = searchParams.get("tab");
  const isSettingsActive = pathname === "/settings";
  const activeSettingsTab = !currentTab
    ? "setup"
    : currentTab === "preferences"
    ? "advanced-topics"
    : currentTab;
  const activeSettingsSection: SettingsSectionKey =
    activeSettingsTab === "setup"
      ? "initial"
      : activeSettingsTab === "advanced-platforms" ||
        activeSettingsTab === "advanced-topics" ||
        activeSettingsTab === "webhooks" ||
        activeSettingsTab === "advanced"
      ? "advanced"
      : "rebuild";

  useEffect(() => {
    if (!isSettingsActive) return;
    setSettingsOpen(true);
    setOpenSettingsSection(activeSettingsSection);
  }, [isSettingsActive, activeSettingsSection]);

  const openStudioTab = usePulseStore((s) => s.openStudioTab);

  // Filter assets by search query
  const q = searchQuery.toLowerCase();
  const filteredSkills = q
    ? (assets?.skills || []).filter((s) => {
        const label = (s.displayName || s.name).toLowerCase();
        return label.includes(q) || s.description.toLowerCase().includes(q);
      })
    : assets?.skills || [];
  const filteredPpts = q
    ? (assets?.ppts || []).filter((f) => f.name.toLowerCase().includes(q))
    : assets?.ppts || [];
  const filteredFiles = q
    ? (assets?.files || []).filter((f) => f.name.toLowerCase().includes(q))
    : assets?.files || [];

  // Split skills into kernel (registry) and custom (project/codex)
  const kernelSkills = filteredSkills.filter((s) => s.source === 'registry');
  const customSkills = filteredSkills.filter((s) => s.source !== 'registry');

  const handleSkillClick = (skill: SkillAsset) => {
    openStudioTab(skill.id, skill.displayName || skill.name);
  };

  const handleFileDownload = (type: 'ppt' | 'file', id: string) => {
    onSelectAsset?.(type, id);
  };

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
            {conversations.slice(0, 50).map((conv) => (
              <div key={conv.id} className="group/conv relative">
                <button
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
                {onDeleteConversation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md opacity-0 group-hover/conv:opacity-100 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assets area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Search (filters assets) */}
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

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {/* Skills Folder */}
          <div className="mb-1">
            <button
              onClick={() => setSkillsFolderOpen(!skillsFolderOpen)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ChevronRight
                className={clsx(
                  "w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0",
                  skillsFolderOpen && "rotate-90"
                )}
              />
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{t('sidebar.skills')}</span>
              <span className="ml-auto text-[10px] text-zinc-600 font-mono">
                {filteredSkills.length}
              </span>
            </button>

            {skillsFolderOpen && (
              <div className="pb-1">
                {filteredSkills.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-zinc-600">
                      {searchQuery ? t('sidebar.noMatches') : t('sidebar.noSkills')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* Kernel Skills group */}
                    {kernelSkills.length > 0 && (
                      <div>
                        <button
                          onClick={() => setKernelGroupOpen(!kernelGroupOpen)}
                          className="w-full flex items-center gap-1.5 px-4 py-1 text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          <ChevronRight
                            className={clsx(
                              "w-2.5 h-2.5 transition-transform duration-150 flex-shrink-0",
                              kernelGroupOpen && "rotate-90"
                            )}
                          />
                          <span>{t('sidebar.kernelSkills')}</span>
                          <span className="ml-auto font-mono">{kernelSkills.length}</span>
                        </button>
                        {kernelGroupOpen && (
                          <div className="space-y-0.5">
                            {kernelSkills.map((skill) => (
                              <AssetItem
                                key={skill.id}
                                name={skill.displayName || skill.name}
                                subtitle={skill.description ? skill.description.slice(0, 30) : undefined}
                                icon={Sparkles}
                                onClick={() => handleSkillClick(skill)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Custom Skills group */}
                    {customSkills.length > 0 && (
                      <div>
                        <button
                          onClick={() => setCustomGroupOpen(!customGroupOpen)}
                          className="w-full flex items-center gap-1.5 px-4 py-1 text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          <ChevronRight
                            className={clsx(
                              "w-2.5 h-2.5 transition-transform duration-150 flex-shrink-0",
                              customGroupOpen && "rotate-90"
                            )}
                          />
                          <span>{t('sidebar.customSkills')}</span>
                          <span className="ml-auto font-mono">{customSkills.length}</span>
                        </button>
                        {customGroupOpen && (
                          <div className="space-y-0.5">
                            {customSkills.map((skill) => (
                              <AssetItem
                                key={skill.id}
                                name={skill.displayName || skill.name}
                                subtitle={skill.description ? skill.description.slice(0, 30) : undefined}
                                icon={Sparkles}
                                onClick={() => handleSkillClick(skill)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PPT Folder */}
          <div className="mb-1">
            <button
              onClick={() => setPptsFolderOpen(!pptsFolderOpen)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ChevronRight
                className={clsx(
                  "w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0",
                  pptsFolderOpen && "rotate-90"
                )}
              />
              <Presentation className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{t('sidebar.ppts')}</span>
              <span className="ml-auto text-[10px] text-zinc-600 font-mono">
                {filteredPpts.length}
              </span>
            </button>

            {pptsFolderOpen && (
              <div className="pb-1">
                {filteredPpts.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-zinc-600">
                      {searchQuery ? t('sidebar.noMatches') : t('sidebar.noPpts')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredPpts.map((ppt) => (
                      <AssetItem
                        key={ppt.id}
                        name={ppt.name}
                        icon={Download}
                        onClick={() => handleFileDownload('ppt', ppt.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Files Folder */}
          <div className="mb-1">
            <button
              onClick={() => setFilesFolderOpen(!filesFolderOpen)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ChevronRight
                className={clsx(
                  "w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0",
                  filesFolderOpen && "rotate-90"
                )}
              />
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{t('sidebar.files')}</span>
              <span className="ml-auto text-[10px] text-zinc-600 font-mono">
                {filteredFiles.length}
              </span>
            </button>

            {filesFolderOpen && (
              <div className="pb-1">
                {filteredFiles.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-zinc-600">
                      {searchQuery ? t('sidebar.noMatches') : t('sidebar.noFiles')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredFiles.map((file) => (
                      <AssetItem
                        key={file.id}
                        name={file.name}
                        subtitle={file.type}
                        icon={FileText}
                        onClick={() => handleFileDownload('file', file.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
            settingsOpen ? "max-h-[560px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="px-2 pb-3 space-y-1.5">
            <div className="rounded-lg border border-zinc-800/60 overflow-hidden">
              <button
                onClick={() => setOpenSettingsSection((prev) => (prev === "initial" ? null : "initial"))}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  openSettingsSection === "initial" || (isSettingsActive && activeSettingsSection === "initial")
                    ? "text-zinc-200 bg-zinc-900/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                )}
              >
                <span className="text-[10px] uppercase tracking-wider">{t('sidebar.settings.initialConfig')}</span>
                <ChevronRight
                  className={clsx(
                    "w-3.5 h-3.5 ml-auto transition-transform duration-200",
                    openSettingsSection === "initial" && "rotate-90"
                  )}
                />
              </button>
              <div
                className={clsx(
                  "overflow-hidden transition-all duration-200",
                  openSettingsSection === "initial" ? "max-h-24 opacity-100 pb-1" : "max-h-0 opacity-0"
                )}
              >
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
            </div>

            <div className="rounded-lg border border-zinc-800/60 overflow-hidden">
              <button
                onClick={() => setOpenSettingsSection((prev) => (prev === "advanced" ? null : "advanced"))}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  openSettingsSection === "advanced" || (isSettingsActive && activeSettingsSection === "advanced")
                    ? "text-zinc-200 bg-zinc-900/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                )}
              >
                <span className="text-[10px] uppercase tracking-wider">{t('sidebar.settings.advancedConfig')}</span>
                <ChevronRight
                  className={clsx(
                    "w-3.5 h-3.5 ml-auto transition-transform duration-200",
                    openSettingsSection === "advanced" && "rotate-90"
                  )}
                />
              </button>
              <div
                className={clsx(
                  "overflow-hidden transition-all duration-200",
                  openSettingsSection === "advanced" ? "max-h-56 opacity-100 pb-1" : "max-h-0 opacity-0"
                )}
              >
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
                  <button
                    onClick={() => router.push("/settings?tab=webhooks")}
                    className={clsx(
                      "w-full flex items-center gap-3 pl-8 pr-3 py-2 text-[13px] rounded-lg transition-all duration-200",
                      isSettingsActive && activeSettingsTab === "webhooks"
                        ? "bg-zinc-800/90 text-zinc-200"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                    )}
                  >
                    <Bell className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{t('sidebar.settings.webhooks')}</span>
                  </button>
                  <button
                    onClick={() => router.push("/settings?tab=advanced")}
                    className={clsx(
                      "w-full flex items-center gap-3 pl-8 pr-3 py-2 text-[13px] rounded-lg transition-all duration-200",
                      isSettingsActive && activeSettingsTab === "advanced"
                        ? "bg-zinc-800/90 text-zinc-200"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                    )}
                  >
                    <Settings2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{t('sidebar.settings.advancedSettings')}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800/60 overflow-hidden">
              <button
                onClick={() => setOpenSettingsSection((prev) => (prev === "rebuild" ? null : "rebuild"))}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  openSettingsSection === "rebuild" || (isSettingsActive && activeSettingsSection === "rebuild")
                    ? "text-zinc-200 bg-zinc-900/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                )}
              >
                <span className="text-[10px] uppercase tracking-wider">RebuilD</span>
                <ChevronRight
                  className={clsx(
                    "w-3.5 h-3.5 ml-auto transition-transform duration-200",
                    openSettingsSection === "rebuild" && "rotate-90"
                  )}
                />
              </button>
              <div
                className={clsx(
                  "overflow-hidden transition-all duration-200",
                  openSettingsSection === "rebuild" ? "max-h-[180px] opacity-100 pb-1" : "max-h-0 opacity-0"
                )}
              >
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
            </div>

            {/* Language Switcher */}
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </div>
  );
}
