"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { PlanPanel } from "@/components/chat/PlanPanel";
import { AgentTeamPanel } from "@/components/chat/AgentTeamPanel";
import { ClarificationForm } from "@/components/chat/ClarificationForm";
import { DMDecisionPanel } from "@/components/chat/DMDecisionPanel";
import { ArchitectResumePanel } from "@/components/chat/ArchitectResumePanel";
import { SolutionPreviewPanel } from "@/components/chat/SolutionPreviewPanel";
import { SkillStudioPanel } from "@/components/studio/SkillStudioPanel";
import { usePulseStore } from "@/store/usePulseStore.new";
import { useTranslation } from "@/lib/i18n";
import type { AssetsData } from "@/components/layout/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false);
  const pathname = usePathname();
  const { t, locale } = useTranslation();

  useEffect(() => { setHasMounted(true); }, []);

  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login');
    } else if (authStatus === 'authenticated' && !(session?.user as any)?.currentOrgId) {
      router.push('/no-organization');
    }
  }, [authStatus, session, router]);

  // Sync <html lang> attribute with locale
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const [assets, setAssets] = useState<AssetsData | null>(null);
  const isSidebarCollapsed = usePulseStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = usePulseStore((s) => s.toggleSidebar);
  const conversations = usePulseStore((s) => s.conversations);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const setActiveConversationId = usePulseStore((s) => s.setActiveConversationId);
  const removeConversation = usePulseStore((s) => s.removeConversation);
  const setProjects = usePulseStore((s) => s.setProjects);
  const planPanelVisible = usePulseStore((s) => s.planPanel.visible);
  const teamPanelVisible = usePulseStore((s) => s.teamPanel.visible);
  const clarificationVisible = usePulseStore((s) => s.clarificationPanel.visible);
  const dmPanelVisible = usePulseStore((s) => s.dmPanel.visible);
  const architectPanelVisible = usePulseStore((s) => s.architectPanel.visible);
  const solutionPanelVisible = usePulseStore((s) => s.solutionPanel.visible);
  const teamCollaborationActive = usePulseStore((s) => s.teamCollaboration.active);
  const studioVisible = usePulseStore((s) => s.studioPanel.visible);

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

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setProjects(json.data);
      }
    } catch {
      // Keep existing projects if backend is unreachable
    }
  }, [setProjects]);

  // Fetch assets on first mount
  useEffect(() => {
    fetchAssets(true);
  }, [fetchAssets]);

  // Fetch projects on first mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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

  if (!hasMounted || authStatus === 'loading') {
    return (
      <div className="flex h-screen w-screen bg-background text-foreground items-center justify-center">
        <div className="animate-pulse text-[var(--text-muted)]">{t('dashboard.loading')}</div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') return null; // will redirect

  const rightPanel = teamCollaborationActive
    ? undefined  // Team info is shown inline in the main area
    : clarificationVisible
    ? <ClarificationForm />
    : planPanelVisible
    ? <PlanPanel />
    : dmPanelVisible
    ? <DMDecisionPanel />
    : architectPanelVisible
    ? <ArchitectResumePanel />
    : solutionPanelVisible
    ? <SolutionPreviewPanel />
    : teamPanelVisible
    ? <AgentTeamPanel />
    : undefined;

  return (
    <DashboardShell
      sidebarOpen={!isSidebarCollapsed}
      onToggleSidebar={toggleSidebar}
      rightPanelOpen={!teamCollaborationActive && (clarificationVisible || planPanelVisible || dmPanelVisible || architectPanelVisible || solutionPanelVisible || teamPanelVisible)}
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
      studioPanel={studioVisible ? <SkillStudioPanel /> : undefined}
      studioPanelOpen={studioVisible}
    />
  );
}
