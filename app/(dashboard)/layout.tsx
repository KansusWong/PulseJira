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
  const sidebarOpen = usePulseStore((s) => s.sidebarOpen);
  const toggleSidebar = usePulseStore((s) => s.toggleSidebar);
  const conversations = usePulseStore((s) => s.conversations);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);
  const setActiveConversationId = usePulseStore((s) => s.setActiveConversationId);
  const planPanelVisible = usePulseStore((s) => s.planPanel.visible);
  const teamPanelVisible = usePulseStore((s) => s.teamPanel.visible);
  const clarificationVisible = usePulseStore((s) => s.clarificationPanel.visible);
  const dmPanelVisible = usePulseStore((s) => s.dmPanel.visible);
  const toolApprovalVisible = usePulseStore((s) => s.toolApprovalPanel.visible);
  const architectPanelVisible = usePulseStore((s) => s.architectPanel.visible);

  const reconciledRef = useRef(false);

  const fetchProjects = useCallback(async () => {
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
      await fetchProjects();
    })();
  }, [fetchProjects]);

  // Re-fetch projects whenever the user navigates between pages
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
        }).catch(() => {});
      }
    },
    [updateProjectInStore]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      const project = usePulseStore.getState().projects.find((p) => p.id === id);
      const label = project?.name || "this project";
      if (!window.confirm(t('dashboard.confirmDelete', { name: label }))) return;

      if (!id.startsWith("local-")) {
        await fetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => {});
      }
      removeProject(id);
    },
    [removeProject]
  );

  if (!hasMounted) {
    return (
      <div className="flex h-screen w-screen bg-background text-foreground items-center justify-center">
        <div className="animate-pulse text-zinc-600">{t('dashboard.loading')}</div>
      </div>
    );
  }

  const rightPanel = clarificationVisible
    ? <ClarificationForm />
    : planPanelVisible
    ? <PlanPanel />
    : dmPanelVisible
    ? <DMDecisionPanel />
    : toolApprovalVisible
    ? <ToolApprovalPanel />
    : architectPanelVisible
    ? <ArchitectResumePanel />
    : teamPanelVisible
    ? <AgentTeamPanel />
    : undefined;

  return (
    <DashboardShell
      sidebarOpen={sidebarOpen}
      onToggleSidebar={toggleSidebar}
      rightPanelOpen={clarificationVisible || planPanelVisible || dmPanelVisible || toolApprovalVisible || architectPanelVisible || teamPanelVisible}
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
          onNewChat={() => setActiveConversationId(null)}
        />
      }
      main={children}
      rightPanel={rightPanel}
    />
  );
}
