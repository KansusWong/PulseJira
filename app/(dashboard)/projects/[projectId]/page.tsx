"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrainCircuit, Loader2 } from "lucide-react";
import { usePulseStore } from "@/store/usePulseStore.new";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { PageSwitcher } from "@/components/project/PageSwitcher";
import { TasksPageView } from "@/components/project/TasksPageView";
import { AgentProgressBar } from "@/components/agents/AgentProgressBar";
import { AgentActivityFeed } from "@/components/agents/AgentActivityFeed";
import { ImplementResultCard } from "@/components/project/ImplementResultCard";
import { TracesPageView } from "@/components/traces/TracesPageView";
import { DmReviewDrawer } from "@/components/project/DmReviewDrawer";
import type { ImplementResultData, PreviewSessionData } from "@/components/project/ImplementResultCard";
import type { Project } from "@/projects/types";
import { useTranslation } from "@/lib/i18n";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { t } = useTranslation();

  const [hasMounted, setHasMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const projects = usePulseStore((s) => s.projects);
  const addProject = usePulseStore((s) => s.addProject);
  const updateProjectInStore = usePulseStore((s) => s.updateProjectInStore);
  const removeProject = usePulseStore((s) => s.removeProject);
  const updateTaskStatus = usePulseStore((s) => s.updateTaskStatus);
  const addTasks = usePulseStore((s) => s.addTasks);
  const setTasks = usePulseStore((s) => s.setTasks);
  const allTasks = usePulseStore((s) => s.tasks);

  const [fetchStatus, setFetchStatus] = useState<"idle" | "fetching" | "done">("idle");
  const fetchedRef = useRef<string | null>(null);

  const tasksFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasMounted) return;
    if (projectId.startsWith("local-")) return;
    if (fetchedRef.current === projectId) return;

    fetchedRef.current = projectId;

    const inStore = usePulseStore.getState().projects.some((p) => p.id === projectId);
    if (!inStore) {
      setFetchStatus("fetching");
    }

    // Always fetch latest project data from API so fields like
    // implementation_plan (written by the backend) are available.
    fetch(`/api/projects/${projectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          console.log('[DEBUG] API project data — has implementation_plan:', !!json.data.implementation_plan, 'tasks count:', json.data.implementation_plan?.tasks?.length ?? 0);
          const alreadyInStore = usePulseStore.getState().projects.some((p) => p.id === projectId);
          if (alreadyInStore) {
            updateProjectInStore(projectId, json.data);
          } else {
            addProject(json.data as Project);
          }

          // Hydrate persisted agent logs if no execution is running
          if (json.data.agent_logs?.length && !usePulseStore.getState().isRunning) {
            usePulseStore.getState().hydrateAgentLogs(
              json.data.agent_logs.map((log: any, i: number) => ({
                id: log.id || `restored-${i}`,
                agent: log.agent || 'system',
                type: log.type || 'log',
                message: log.message || '',
                timestamp: log.timestamp || 0,
                taskId: log.taskId,
                taskTitle: log.taskTitle,
              }))
            );
          }
        }
      })
      .catch((err) => console.error('[DEBUG] project fetch error:', err))
      .finally(() => setFetchStatus("done"));
  }, [hasMounted, projectId, addProject, updateProjectInStore]);

  // Restore task statuses from the database.
  // Waits for project fetch to complete (fetchStatus === "done") so we can
  // check whether implementation_plan exists — if it does, the plan-based
  // restore (below) is the authoritative source and we skip the DB fetch.
  useEffect(() => {
    if (!hasMounted) return;
    if (fetchStatus !== "done") return;
    if (projectId.startsWith("local-")) return;
    if (usePulseStore.getState().isRunning) return;
    if (tasksFetchedRef.current === projectId) return;

    const p = usePulseStore.getState().projects.find((proj) => proj.id === projectId);
    if ((p as any)?.implementation_plan?.tasks?.length) return;

    tasksFetchedRef.current = projectId;

    fetch(`/api/projects/${projectId}/tasks`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.success || !json.data?.length) return;
        const tagMap: Record<string, string> = { feature: "Feature", bug: "Bug", chore: "Chore" };
        const dbTasks = json.data.map((t: any) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          tag: tagMap[t.type] || "Chore",
          description: t.description,
          priority: t.priority,
          affected_files: t.affected_files,
          projectId,
        }));
        const otherTasks = usePulseStore.getState().tasks.filter((t) => t.projectId !== projectId);
        setTasks([...otherTasks, ...dbTasks]);
      })
      .catch((err) => console.error('[project-page] Fetch tasks failed:', err));
  }, [hasMounted, projectId, fetchStatus, setTasks]);

  const agentLogs = usePulseStore((s) => s.agentLogs);
  const activeAgents = usePulseStore((s) => s.activeAgents);
  const currentStage = usePulseStore((s) => s.currentStage);
  const currentStep = usePulseStore((s) => s.currentStep);
  const totalSteps = usePulseStore((s) => s.totalSteps);
  const globalIsRunning = usePulseStore((s) => s.isRunning);
  const runningProjectId = usePulseStore((s) => s.runningProjectId);
  const addAgentLog = usePulseStore((s) => s.addAgentLog);
  const setStage = usePulseStore((s) => s.setStage);
  const setProgress = usePulseStore((s) => s.setProgress);
  const setRunning = usePulseStore((s) => s.setRunning);
  const resetAgentState = usePulseStore((s) => s.resetAgentState);

  const isRunning = globalIsRunning && runningProjectId === projectId;

  // Maps backend taskId (e.g. "task-1") → kanban task title for log grouping
  const backendIdToTitleRef = useRef<Map<string, string>>(new Map());

  const prevProjectRef = useRef(projectId);
  useEffect(() => {
    if (prevProjectRef.current !== projectId) {
      prevProjectRef.current = projectId;
      setCurrentPage(0);
      backendIdToTitleRef.current.clear();
      if (runningProjectId !== projectId) {
        resetAgentState();
      }
    }
  }, [projectId, runningProjectId, resetAgentState]);

  // After persist hydration, reset any stale "in-progress" tasks left over
  // from a previous run that was interrupted (page refresh / SSE disconnect).
  // Skip when the project has implementation_plan — the plan-based restore
  // effect will set correct statuses and this reset would conflict with it.
  useEffect(() => {
    if (!hasMounted) return;
    if (usePulseStore.getState().isRunning) return;

    const p = usePulseStore.getState().projects.find((proj) => proj.id === projectId);
    if ((p as any)?.implementation_plan?.tasks?.length) return;

    const hasStale = allTasks.some(
      (t) => t.projectId === projectId && t.status === "in-progress"
    );
    if (hasStale) {
      setTasks(
        allTasks.map((t) =>
          t.projectId === projectId && t.status === "in-progress"
            ? { ...t, status: "todo" as const }
            : t
        )
      );
    }
  }, [hasMounted, projectId, allTasks, setTasks]);

  const [implementResult, setImplementResult] = useState<ImplementResultData | null>(null);
  // Remote deploy
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ state: string; deploymentUrl?: string | null } | null>(null);
  // Local preview
  const [previewStatus, setPreviewStatus] = useState<PreviewSessionData | null>(null);
  // Push PR
  const [isPushingPR, setIsPushingPR] = useState(false);
  const [pushPRResult, setPushPRResult] = useState<{ prUrl: string; prNumber: number } | null>(null);
  // DM Review drawer (for conversation-sourced projects)
  const [dmDrawerOpen, setDmDrawerOpen] = useState(false);

  const project = hasMounted ? projects.find((p) => p.id === projectId) : undefined;

  useEffect(() => {
    const p = usePulseStore.getState().projects.find((proj) => proj.id === projectId);
    if (!p) {
      setImplementResult(null);
      setDeployResult(null);
      setPreviewStatus(null);
      setPushPRResult(null);
      return;
    }

    if (p.implement_result) {
      setImplementResult(p.implement_result as unknown as ImplementResultData);
    } else {
      setImplementResult(null);
    }
    setDeployResult(null);
    setPreviewStatus(null);
    setPushPRResult(null);

    // Recover stale execution states when no agent is running.
    const isStaleExecution =
      !usePulseStore.getState().isRunning &&
      (
        (["implementing", "active"].includes(p.status) && !p.implement_result) ||
        (p.status === "implemented" && p.implement_result?.status === "failed")
      );

    if (isStaleExecution) {
      updateProjectInStore(projectId, { status: "draft" });
      if (!projectId.startsWith("local-")) {
        fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "draft" }),
        }).catch((err) => console.error('[project-page] Update project status failed:', err));
      }
    }

    // Restore kanban tasks from implementation_plan
    const implPlan = (p as any).implementation_plan;
    if (implPlan?.tasks?.length && !usePulseStore.getState().isRunning) {
      const statusMap: Record<string, "todo" | "in-progress" | "done"> = {
        pending: "todo",
        running: "in-progress",
        completed: "done",
        failed: "todo",
      };
      const tagMap: Record<string, string> = { feature: "Feature", bug: "Bug", chore: "Chore" };
      const restored = implPlan.tasks.map((t: any, i: number) => ({
        id: t.id || `task-${Date.now()}-${i}`,
        title: t.title,
        status: statusMap[t.status] || "todo",
        tag: tagMap[t.agentTemplate] || "Chore",
        description: t.description,
        projectId,
      }));
      const otherTasks = usePulseStore.getState().tasks.filter((t) => t.projectId !== projectId);
      setTasks([...otherTasks, ...restored]);
    }
  }, [projectId, fetchStatus, updateProjectInStore, setTasks]);

  const parseSSE = useCallback((line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) return;
    try {
      const msg = JSON.parse(trimmed.slice(6));
      if (msg.type === "log" || msg.type === "agent_log") {
        // Use mapping if available (task_update arrives before agent_log),
        // otherwise fall back to the title from the backend
        const resolvedTitle = (msg.taskId && backendIdToTitleRef.current.get(msg.taskId))
          || msg.taskTitle
          || undefined;
        addAgentLog({
          agent: msg.agent || "pm",
          type: "log",
          message: msg.message,
          taskId: msg.taskId,
          taskTitle: resolvedTitle,
        });
      } else if (msg.type === "agent_start") {
        setProgress(msg.step || 0, msg.total_steps || 6);
      } else if (msg.type === "task_update") {
        const statusMap: Record<string, "todo" | "in-progress" | "done"> = {
          pending: "todo",
          running: "in-progress",
          completed: "done",
          failed: "todo",
        };
        const kanbanStatus = statusMap[msg.status] || "todo";
        if (!msg.title) return null;

        const currentTasks = usePulseStore.getState().tasks;
        const existing = currentTasks.find(
          (t) => t.projectId === projectId && t.title === msg.title
        );

        if (existing) {
          updateTaskStatus(existing.id, kanbanStatus);
        } else {
          addTasks([{
            id: `task-${Date.now()}-${msg.index || 0}`,
            title: msg.title,
            status: kanbanStatus,
            tag: "Chore",
            projectId,
          }]);
        }

        // Map backend taskId → task title for log grouping
        if (msg.taskId) {
          backendIdToTitleRef.current.set(msg.taskId, msg.title);
        }
      } else if (msg.type === "result") {
        return msg.data;
      } else if (msg.type === "error") {
        addAgentLog({ agent: "pm", type: "log", message: `Error: ${msg.error}` });
      }
    } catch { /* skip parse errors */ }
    return null;
  }, [addAgentLog, setProgress, projectId, updateTaskStatus, addTasks]);

  const readSSEStream = useCallback(async (response: Response): Promise<any> => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No readable stream");
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const parsed = parseSSE(line);
        if (parsed) result = parsed;
      }
    }
    return result;
  }, [parseSSE]);

  const handleExecute = async () => {
    if (!project) return;

    // Conversation-sourced projects: route to DM review flow
    if ((project as any).conversation_id) {
      setDmDrawerOpen(true);
      return;
    }
  };



  // ── Local preview handlers ──

  const handlePreviewStart = async () => {
    if (!project) return;
    setPreviewStatus({ projectId, port: 0, pid: 0, status: "installing", url: "" });
    addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.startingPreview') });

    try {
      const response = await fetch(`/api/projects/${project.id}/preview`, {
        method: "POST",
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        // Already running — fetch its current status
        if (json?.data?.status === "ready") {
          setPreviewStatus(json.data);
          window.open(json.data.url, "_blank");
          return;
        }
        throw new Error(json?.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const trimmed = chunk.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(trimmed.slice(6));
            if (msg.type === "status") {
              setPreviewStatus(msg as PreviewSessionData);
              if (msg.status === "installing") {
                addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.installingDeps') });
              } else if (msg.status === "starting") {
                addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.startingDevServer') });
              }
            } else if (msg.type === "result" && msg.data) {
              setPreviewStatus(msg.data);
              if (msg.data.status === "ready") {
                addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.previewReady', { url: msg.data.url }) });
                window.open(msg.data.url, "_blank");
              }
            } else if (msg.type === "error") {
              setPreviewStatus((prev) => prev ? { ...prev, status: "failed", error: msg.error } : null);
              addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.previewFailed', { error: msg.error }) });
            }
          } catch { /* skip parse errors */ }
        }
      }
    } catch (e: any) {
      setPreviewStatus({ projectId, port: 0, pid: 0, status: "failed", url: "", error: e.message });
      addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.previewFailed', { error: e.message }) });
    }
  };

  const handlePreviewStop = async () => {
    if (!project) return;
    try {
      await fetch(`/api/projects/${project.id}/preview`, { method: "DELETE" });
    } catch { /* best-effort */ }
    setPreviewStatus(null);
    addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.previewStopped') });
  };

  const handlePreviewOpen = () => {
    if (previewStatus?.url) {
      window.open(previewStatus.url, "_blank");
    }
  };

  // Recover preview status on page load
  useEffect(() => {
    if (!hasMounted || !implementResult || implementResult.prUrl) return;
    fetch(`/api/projects/${projectId}/preview`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.status === "ready" || json?.data?.status === "starting" || json?.data?.status === "installing") {
          setPreviewStatus(json.data);
        }
      })
      .catch((err) => console.error('[project-page] Fetch preview status failed:', err));
  }, [hasMounted, projectId, implementResult]);


  // ── Push PR handler ──

  const handlePushPR = async () => {
    if (!project) return;

    const repoUrl = window.prompt(
      t('projectDetail.enterRepoUrl'),
      "",
    );
    if (!repoUrl?.trim()) return;

    setIsPushingPR(true);
    addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.pushingCode') });

    try {
      const response = await fetch(`/api/projects/${project.id}/push-pr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl.trim() }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await readSSEStream(response);
      if (data?.prUrl) {
        setPushPRResult({ prUrl: data.prUrl, prNumber: data.prNumber });
        updateProjectInStore(projectId, { status: "deployed" });
        addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.prCreated', { url: data.prUrl }) });
      }
    } catch (e: any) {
      addAgentLog({ agent: "deployer", type: "log", message: t('projectDetail.pushFailed', { error: e.message }) });
    } finally {
      setIsPushingPR(false);
    }
  };


  const handleDelete = async () => {
    if (!project) return;

    if (!project.id.startsWith("local-")) {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    }
    removeProject(project.id);
    router.push("/");
  };

  if (!hasMounted) return null;

  if (!project) {
    if (fetchStatus === "fetching" || (fetchStatus === "idle" && !projectId.startsWith("local-"))) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        Project not found
      </div>
    );
  }

  const isImplementStage = isRunning && currentStage === "implement";
  const projectTasks = allTasks.filter((t) => t.projectId === projectId);
  const hasTasks = projectTasks.length > 0;

  return (
    <div className="flex flex-col h-full">
      <ProjectHeader
        project={project}
        onDelete={handleDelete}
        isRunning={isRunning}
        conversationId={project.conversation_id}
        onPromote={async (data) => {
          try {
            const res = await fetch(`/api/projects/${projectId}/promote`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Promote failed");
            addAgentLog({ agent: "system", type: "log", message: t('project.promote.success') });
          } catch (e: any) {
            addAgentLog({ agent: "system", type: "log", message: `${t('project.promote.failed')}: ${e.message}` });
            throw e;
          }
        }}
      />

      {/* Page switcher — only show when there are tasks or implement stage */}
      {(hasTasks || isImplementStage || implementResult || (project && project.status !== 'draft')) && (
        <PageSwitcher
          currentPage={currentPage}
          totalPages={3}
          onPageChange={setCurrentPage}
          labels={[t('trace.pageOverview'), t('trace.pageTasks'), t('trace.pageTraces')]}
        />
      )}

      {/* ────── Page 1: Overview ────── */}
      {currentPage === 0 && (
        <div className="flex-1 overflow-y-auto p-4">
          {/* Progress bar */}
          {!isImplementStage && (
            <AgentProgressBar
              currentStage={currentStage}
              currentStep={currentStep}
              totalSteps={totalSteps}
              activeAgents={activeAgents}
            />
          )}

          {/* Agent activity */}
          {!isImplementStage && agentLogs.length > 0 && (
            <div className="mb-6">
              <AgentActivityFeed logs={agentLogs} />
            </div>
          )}

          {/* Running indicator */}
          {isRunning && !isImplementStage && agentLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse mb-4">
                <BrainCircuit className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-[var(--text-secondary)] animate-pulse">Processing...</p>
            </div>
          )}

          {/* Empty state */}
          {!isRunning && !implementResult && agentLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BrainCircuit className="w-12 h-12 text-[var(--text-disabled)] mb-4" />
              <h2 className="text-lg font-bold text-[var(--text-secondary)] mb-2">{project.name}</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">{project.description}</p>
            </div>
          )}
        </div>
      )}

      {/* ────── Page 2: Tasks ────── */}
      {currentPage === 1 && (
        <div className="flex-1 overflow-y-auto">
          {/* Show progress bar during implement stage */}
          {isImplementStage && (
            <div className="px-4 pt-4">
              <AgentProgressBar
                currentStage={currentStage}
                currentStep={currentStep}
                totalSteps={totalSteps}
                activeAgents={activeAgents}
              />
            </div>
          )}

          <TasksPageView
            tasks={projectTasks}
            logs={agentLogs}
            isRunning={isRunning}
            isImplementStage={isImplementStage}
            onUpdateStatus={updateTaskStatus}
          />

          {/* Implementation result summary */}
          {implementResult && (
            <div className="px-4 pb-4">
              <ImplementResultCard
                result={implementResult}
                projectId={projectId}
                isDeploying={isDeploying}
                deployResult={deployResult}
                previewStatus={previewStatus}
                onPreviewStart={handlePreviewStart}
                onPreviewStop={handlePreviewStop}
                onPreviewOpen={handlePreviewOpen}
                onPushPR={handlePushPR}
                isPushingPR={isPushingPR}
                pushPRResult={pushPRResult}
              />
            </div>
          )}
        </div>
      )}

      {/* ────── Page 3: Traces ────── */}
      {currentPage === 2 && (
        <div className="flex-1 overflow-y-auto">
          <TracesPageView projectId={projectId} />
        </div>
      )}

      {/* DM Review drawer for conversation-sourced projects */}
      {dmDrawerOpen && (project as any).conversation_id && (
        <DmReviewDrawer
          conversationId={(project as any).conversation_id}
          onClose={() => setDmDrawerOpen(false)}
        />
      )}
    </div>
  );
}
