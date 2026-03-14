"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { PlanPanel } from "@/components/chat/PlanPanel";
import { AgentTeamPanel } from "@/components/chat/AgentTeamPanel";
import { ClarificationForm } from "@/components/chat/ClarificationForm";
import { DMDecisionPanel } from "@/components/chat/DMDecisionPanel";
import { ToolApprovalPanel } from "@/components/chat/ToolApprovalPanel";
import { ArchitectResumePanel } from "@/components/chat/ArchitectResumePanel";
import { SolutionPreviewPanel } from "@/components/chat/SolutionPreviewPanel";
import { usePulseStore } from "@/store/usePulseStore.new";
import { useTranslation } from "@/lib/i18n";
import type { AssetsData } from "@/components/layout/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false);
  const pathname = usePathname();
  const { t, locale } = useTranslation();

  useEffect(() => { setHasMounted(true); }, []);

  // Sync <html lang> attribute with locale
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const [assets, setAssets] = useState<AssetsData | null>(null);
  const sidebarOpen = usePulseStore((s) => s.sidebarOpen);
  const toggleSidebar = usePulseStore((s) => s.toggleSidebar);
  const conversations = usePulseStore((s) => s.conversations);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const setActiveConversationId = usePulseStore((s) => s.setActiveConversationId);
  const removeConversation = usePulseStore((s) => s.removeConversation);
  const planPanelVisible = usePulseStore((s) => s.planPanel.visible);
  const teamPanelVisible = usePulseStore((s) => s.teamPanel.visible);
  const clarificationVisible = usePulseStore((s) => s.clarificationPanel.visible);
  const dmPanelVisible = usePulseStore((s) => s.dmPanel.visible);
  const toolApprovalVisible = usePulseStore((s) => s.toolApprovalPanel.visible);
  const architectPanelVisible = usePulseStore((s) => s.architectPanel.visible);
  const solutionPanelVisible = usePulseStore((s) => s.solutionPanel.visible);
  const teamCollaborationActive = usePulseStore((s) => s.teamCollaboration.active);

  const lastAssetsFetchRef = useRef(0);
  const ASSETS_FETCH_THROTTLE_MS = 10_000;

  const fetchAssets = useCallback(async (force?: boolean) => {
    const now = Date.now();
    if (!force && now - lastAssetsFetchRef.current < ASSETS_FETCH_THROTTLE_MS) return;
    lastAssetsFetchRef.current = now;

    try {
      const res = await fetch("/api/assets");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setAssets(json.data);
      }
    } catch {
      // Keep existing assets if backend is unreachable
    }
  }, []);

  // Fetch assets on first mount
  useEffect(() => {
    fetchAssets(true);
  }, [fetchAssets]);

  // Re-fetch assets on navigation (throttled)
  useEffect(() => {
    fetchAssets();
  }, [fetchAssets, pathname]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      removeConversation(id);
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' }).catch((err) =>
        console.error('[dashboard] Delete conversation failed:', err),
      );
    },
    [removeConversation],
  );

  if (!hasMounted) {
    return (
      <div className="flex h-screen w-screen bg-background text-foreground items-center justify-center">
        <div className="animate-pulse text-zinc-600">{t('dashboard.loading')}</div>
      </div>
    );
  }

  const rightPanel = teamCollaborationActive
    ? undefined  // Team info is shown inline in the main area
    : clarificationVisible
    ? <ClarificationForm />
    : planPanelVisible
    ? <PlanPanel />
    : dmPanelVisible
    ? <DMDecisionPanel />
    : toolApprovalVisible
    ? <ToolApprovalPanel />
    : architectPanelVisible
    ? <ArchitectResumePanel />
    : solutionPanelVisible
    ? <SolutionPreviewPanel />
    : teamPanelVisible
    ? <AgentTeamPanel />
    : undefined;

  return (
    <DashboardShell
      sidebarOpen={sidebarOpen}
      onToggleSidebar={toggleSidebar}
      rightPanelOpen={!teamCollaborationActive && (clarificationVisible || planPanelVisible || dmPanelVisible || toolApprovalVisible || architectPanelVisible || solutionPanelVisible || teamPanelVisible)}
      sidebar={
        <Sidebar
          onToggleSidebar={toggleSidebar}
          assets={assets}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          onDeleteConversation={handleDeleteConversation}
          onNewChat={() => setActiveConversationId(null)}
        />
      }
      main={children}
      rightPanel={rightPanel}
    />
  );
}
