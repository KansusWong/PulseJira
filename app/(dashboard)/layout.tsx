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
import type { Project } from "@/projects/types";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false);
  const pathname = usePathname();
  const { t, locale } = useTranslation();

  useEffect(() => { setHasMounted(true); }, []);

  // Sync <html lang> attribute with locale
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const projects = usePulseStore((s) => s.projects);
  const setProjects = usePulseStore((s) => s.setProjects);
  const activeProjectId = usePulseStore((s) => s.activeProjectId);
  const setActiveProject = usePulseStore((s) => s.setActiveProject);
  const updateProjectInStore = usePulseStore((s) => s.updateProjectInStore);
  const removeProject = usePulseStore((s) => s.removeProject);
  const activeDeliverableId = usePulseStore((s) => s.activeDeliverableId);
  const setActiveDeliverable = usePulseStore((s) => s.setActiveDeliverable);
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

  const reconciledRef = useRef(false);
  const lastFetchRef = useRef(0);
  const FETCH_THROTTLE_MS = 5_000; // At most one fetch every 5 seconds

  const fetchProjects = useCallback(async (force?: boolean) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < FETCH_THROTTLE_MS) return;
    lastFetchRef.current = now;

    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) return;

      const backendProjects: Project[] = json.data;
      const backendIds = new Set(backendProjects.map((p) => p.id));
      const currentProjects = usePulseStore.getState().projects;
      const localOnly = currentProjects.filter(
        (p) => p.id.startsWith("local-") && !backendIds.has(p.id)
      );

      setProjects([...backendProjects, ...localOnly]);
    } catch {
      // Keep existing local projects if backend is unreachable
    }
  }, [setProjects]);

  // On first mount: reconcile stale statuses in DB, then fetch projects
  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;

    (async () => {
      try {
        await fetch("/api/projects/reconcile", { method: "POST" });
      } catch { /* backend may be unreachable */ }
      await fetchProjects(true);
    })();
  }, [fetchProjects]);

  // Re-fetch projects whenever the user navigates between pages (throttled)
  useEffect(() => {
    if (!reconciledRef.current) return;
    fetchProjects();
  }, [fetchProjects, pathname]);

  const handleRenameProject = useCallback(
    async (id: string, name: string) => {
      updateProjectInStore(id, { name });
      if (!id.startsWith("local-")) {
        fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }).catch((err) => console.error('[dashboard] Update project name failed:', err));
      }
    },
    [updateProjectInStore]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (!id.startsWith("local-")) {
        await fetch(`/api/projects/${id}`, { method: "DELETE" }).catch((err) => console.error('[dashboard] Delete project failed:', err));
      }
      removeProject(id);
    },
    [removeProject]
  );

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
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={setActiveProject}
          onToggleSidebar={toggleSidebar}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          onDeleteConversation={handleDeleteConversation}
          onNewChat={() => setActiveConversationId(null)}
          activeDeliverableId={activeDeliverableId}
          onSelectDeliverable={setActiveDeliverable}
        />
      }
      main={children}
      rightPanel={rightPanel}
    />
  );
}
