"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrainCircuit, Loader2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { usePulseStore } from "@/store/usePulseStore.new";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { PageSwitcher } from "@/components/project/PageSwitcher";
import { TasksPageView } from "@/components/project/TasksPageView";
import { AgentProgressBar } from "@/components/agents/AgentProgressBar";
import { AgentActivityFeed } from "@/components/agents/AgentActivityFeed";
import { PrepareResultCard } from "@/components/agents/PrepareResultCard";
import { PlanResultCard } from "@/components/agents/PlanResultCard";
import { ImplementResultCard } from "@/components/project/ImplementResultCard";
import type { ImplementResultData, PreviewSessionData } from "@/components/project/ImplementResultCard";
import type { PrepareResult } from "@/store/usePulseStore.new";
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
    // #region agent log
    fetch('http://127.0.0.1:7891/ingest/308aacb9-3b7c-48db-aea3-6543ee10f294',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'173eed'},body:JSON.stringify({sessionId:'173eed',location:'[projectId]/page.tsx:mount',message:'ProjectDetailPage mounted successfully',data:{projectId},timestamp:Date.now(),hypothesisId:'B'})}).catch(() => { /* debug ingest — non-critical */ });
    // #endregion
  }, []);

  const projects = usePulseStore((s) => s.projects);
  const addProject = usePulseStore((s) => s.addProject);
  const updateProjectInStore = usePulseStore((s) => s.updateProjectInStore);
  const removeProject = usePulseStore((s) => s.removeProject);
  const deployToKanban = usePulseStore((s) => s.deployToKanban);
  const getProjectTaskProgress = usePulseStore((s) => s.getProjectTaskProgress);
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

  const [prepareResult, setPrepareResult] = useState<PrepareResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [implementResult, setImplementResult] = useState<ImplementResultData | null>(null);
  // Remote deploy
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ state: string; deploymentUrl?: string | null } | null>(null);
  // Local preview
  const [previewStatus, setPreviewStatus] = useState<PreviewSessionData | null>(null);
  // Push PR
  const [isPushingPR, setIsPushingPR] = useState(false);
  const [pushPRResult, setPushPRResult] = useState<{ prUrl: string; prNumber: number } | null>(null);

  const project = hasMounted ? projects.find((p) => p.id === projectId) : undefined;

  useEffect(() => {
    const p = usePulseStore.getState().projects.find((proj) => proj.id === projectId);
    if (!p) {
      setPrepareResult(null);
      setAnalysisResult(null);
      setImplementResult(null);
      setDeployResult(null);
      setPreviewStatus(null);
      setPushPRResult(null);
      return;
    }

    setPrepareResult(
      p.prepare_result
        ? { ...(p.prepare_result as PrepareResult), signalId: (p.prepare_result as any)?.signalId || p.signal_id }
        : null
    );

    if (p.implement_result) {
      setImplementResult(p.implement_result as unknown as ImplementResultData);
      setAnalysisResult(p.plan_result ?? null);
    } else if (p.plan_result) {
      setAnalysisResult(p.plan_result);
      setImplementResult(null);
    } else {
      setAnalysisResult(null);
      setImplementResult(null);
    }
    setDeployResult(null);
    setPreviewStatus(null);
    setPushPRResult(null);

    // Recover stale execution states when no agent is running.
    // "implementing"/"active" without result → interrupted mid-run
    // "implemented" with failed result → pipeline crashed, not truly implemented
    const isStaleExecution =
      !usePulseStore.getState().isRunning &&
      (
        (["implementing", "active"].includes(p.status) && !p.implement_result) ||
        (p.status === "implemented" && p.implement_result?.status === "failed")
      );

    if (isStaleExecution) {
      const recoveredStatus = p.plan_result ? "planned" : "draft";
      updateProjectInStore(projectId, { status: recoveredStatus });
      if (!projectId.startsWith("local-")) {
        fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: recoveredStatus }),
        }).catch((err) => console.error('[project-page] Update project status failed:', err));
      }
    }

    // Restore kanban tasks: prefer implementation_plan (has true final statuses)
    // over plan_result (all tasks would be created as 'todo').
    const implPlan = (p as any).implementation_plan;
    console.log('[DEBUG] task restore — fetchStatus:', fetchStatus, 'implPlan tasks:', implPlan?.tasks?.length ?? 0, 'plan_result tasks:', p.plan_result?.tasks?.length ?? 0);
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
    } else if (p.plan_result?.tasks?.length) {
      const projectTasks = usePulseStore.getState().tasks.filter((t) => t.projectId === projectId);
      if (projectTasks.length === 0) {
        usePulseStore.getState().deployToKanban(p.plan_result, projectId);
      }
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

    if (prepareResult) {
      await handleAcceptAndPlan(prepareResult);
      return;
    }

    resetAgentState();
    backendIdToTitleRef.current.clear();
    setPrepareResult(null);
    setAnalysisResult(null);
    setRunning(true, projectId);
    setStage("prepare");

    try {
      const endpoint = project.id.startsWith("local-")
        ? "/api/analyze"
        : `/api/projects/${project.id}/execute`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "prepare",
          description: project.description,
          urls: [],
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await readSSEStream(response);
      if (data) {
        setPrepareResult({ ...data, signalId: data.signalId });
        updateProjectInStore(projectId, { status: "analyzing", prepare_result: data });
        resetAgentState();
      }
    } catch (e: any) {
      addAgentLog({ agent: "pm", type: "log", message: `Error: ${e.message}` });
    } finally {
      setRunning(false);
    }
  };

  const handleAcceptAndPlan = async (currentPrepare: PrepareResult) => {
    if (!project) return;
    resetAgentState();
    setRunning(true, projectId);
    setStage("plan");

    const mrdPitch = currentPrepare.blue_case?.mrd?.executive_pitch || '';
    const confirmedProposal = [
      currentPrepare.blue_case?.proposal ? `Proposal: ${currentPrepare.blue_case.proposal}` : '',
      mrdPitch ? `\nMRD Executive Pitch: ${mrdPitch}` : '',
      currentPrepare.arbitrator_rationale ? `\nArbitrator Rationale: ${currentPrepare.arbitrator_rationale}` : '',
      currentPrepare.business_verdict ? `\nBusiness Verdict: ${currentPrepare.business_verdict}` : '',
    ].filter(Boolean).join('\n') || project.description;

    try {
      const endpoint = project.id.startsWith("local-")
        ? "/api/analyze"
        : `/api/projects/${project.id}/execute`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "plan",
          description: project.description,
          signalId: currentPrepare.signalId || (prepareResult as any)?.signalId || project.signal_id,
          confirmed_proposal: confirmedProposal,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await readSSEStream(response);
      if (data) {
        setAnalysisResult(data);
        updateProjectInStore(projectId, { status: "planned", plan_result: data });
        resetAgentState();
      }
    } catch (e: any) {
      addAgentLog({ agent: "pm", type: "log", message: `Error: ${e.message}` });
    } finally {
      setRunning(false);
    }
  };

  const handleProceed = async (editedResult: PrepareResult) => {
    await handleAcceptAndPlan(editedResult);
  };

  const resetStaleTasks = useCallback(() => {
    const cur = usePulseStore.getState().tasks;
    const hasStale = cur.some((t) => t.projectId === projectId && t.status === "in-progress");
    if (hasStale) {
      setTasks(
        cur.map((t) =>
          t.projectId === projectId && t.status === "in-progress"
            ? { ...t, status: "todo" as const }
            : t
        )
      );
    }
  }, [projectId, setTasks]);

  const handleImplementLocal = async (resumeMode = false) => {
    if (!project) return;
    resetAgentState();
    backendIdToTitleRef.current.clear();

    if (!resumeMode) {
      const otherTasks = allTasks.filter((t) => t.projectId !== projectId);
      setTasks(otherTasks);
    } else {
      // Reset failed/in-progress tasks to todo for visual feedback
      setTasks(
        allTasks.map((t) =>
          t.projectId === projectId && t.status !== "done"
            ? { ...t, status: "todo" as const }
            : t
        )
      );
    }
    setImplementResult(null);
    setDeployResult(null);
    setPreviewStatus(null);
    setPushPRResult(null);
    setRunning(true, projectId);
    setStage("implement");
    setCurrentPage(1);

    try {
      const response = await fetch(`/api/projects/${project.id}/implement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: project.name, resume: resumeMode }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await readSSEStream(response);
      if (data) {
        const implResult: ImplementResultData = {
          status: data.status,
          summary: data.summary,
          prUrl: data.prUrl,
          prNumber: data.prNumber,
          tasksCompleted: data.plan?.tasks?.filter((t: any) => t.status === "completed").length ?? 0,
          tasksTotal: data.plan?.tasks?.length ?? 0,
          filesChanged: data.filesChanged || [],
          testsPassing: data.testsPassing ?? null,
        };
        setImplementResult(implResult);
        updateProjectInStore(projectId, {
          status: data.status === "success" ? "implemented" : "planned",
          implement_result: implResult,
          implementation_plan: data.plan,
        });
      } else {
        addAgentLog({ agent: "system", type: "log", message: t('projectDetail.connectionLost') });
        updateProjectInStore(projectId, { status: "planned" });
        resetStaleTasks();
      }
    } catch (e: any) {
      addAgentLog({ agent: "orchestrator", type: "log", message: `Error: ${e.message}` });
      updateProjectInStore(projectId, { status: "planned" });
      resetStaleTasks();
    } finally {
      setRunning(false);
    }
  };

  const handleResumeImplement = async () => {
    await handleImplementLocal(true);
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

  // ── Remote deploy handler ──

  const handleDeployToProduction = async () => {
    if (!project || !implementResult?.prNumber) return;
    setIsDeploying(true);
    setStage("deploy");
    setRunning(true, projectId);

    try {
      const prUrl = implementResult.prUrl || "";
      const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull/);
      const repoOwner = match?.[1] || "";
      const repoName = match?.[2] || "";

      const response = await fetch(`/api/projects/${project.id}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pr_number: implementResult.prNumber,
          pr_url: implementResult.prUrl,
          repo_owner: repoOwner,
          repo_name: repoName,
          target: "vercel",
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await readSSEStream(response);
      if (data) {
        setDeployResult({ state: data.state, deploymentUrl: data.deploymentUrl });
        if (data.state === "success") {
          updateProjectInStore(projectId, { status: "deployed" });
        }
      }
    } catch (e: any) {
      addAgentLog({ agent: "deployer", type: "log", message: `Error: ${e.message}` });
      setDeployResult({ state: "failed" });
    } finally {
      setIsDeploying(false);
      setRunning(false);
    }
  };

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

  const handleLaunch = async () => {
    deployToKanban(analysisResult, projectId);
    updateProjectInStore(projectId, { status: "active" });
    await handleImplementLocal();
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!window.confirm(t('dashboard.confirmDelete', { name: project.name }))) return;

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
          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Project not found
      </div>
    );
  }

  // Only "deployed" is a truly terminal launched state.
  // "implementing"/"implemented" are recoverable intermediate states —
  // the user should be able to re-launch after a restart.
  const isLaunched = !!project && project.status === "deployed";
  const isPlanRunning = isRunning && currentStage === "plan" && !!prepareResult;
  const isImplementStage = isRunning && currentStage === "implement";
  const isLaunching = isImplementStage;
  const kanbanProgress = getProjectTaskProgress(projectId);
  const projectTasks = allTasks.filter((t) => t.projectId === projectId);
  const hasTasks = projectTasks.length > 0;

  return (
    <div className="flex flex-col h-full">
      <ProjectHeader
        project={project}
        onExecute={handleExecute}
        onDelete={handleDelete}
        isRunning={isRunning}
        hasPrepareResult={!!prepareResult}
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
      {(hasTasks || isImplementStage || implementResult) && (
        <PageSwitcher
          currentPage={currentPage}
          totalPages={2}
          onPageChange={setCurrentPage}
        />
      )}

      {/* ────── Page 1: Overview ────── */}
      {currentPage === 0 && (
        <div className="flex-1 overflow-y-auto p-4">
          {/* Progress bar — only for non-plan, non-implement stages (e.g. prepare) */}
          {!isPlanRunning && !isImplementStage && (
            <AgentProgressBar
              currentStage={currentStage}
              currentStep={currentStep}
              totalSteps={totalSteps}
              activeAgents={activeAgents}
            />
          )}

          {/* Agent activity — only for non-plan, non-implement stages */}
          {!isPlanRunning && !isImplementStage && agentLogs.length > 0 && (
            <div className="mb-6">
              <AgentActivityFeed logs={agentLogs} />
            </div>
          )}

          {/* Running indicator */}
          {isRunning && !isPlanRunning && !isImplementStage && agentLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 animate-pulse mb-4">
                <BrainCircuit className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-zinc-400 animate-pulse">Analyzing signals...</p>
            </div>
          )}

          {/* Prepare result */}
          {prepareResult && (
            <div className="mb-6">
              <PrepareResultCard
                result={prepareResult}
                onProceed={handleProceed}
                onUpdate={setPrepareResult}
                hideAction={isRunning || !!analysisResult}
              />
            </div>
          )}

          {/* Plan stage progress + logs */}
          {isPlanRunning && (
            <div className="mb-6">
              <AgentProgressBar
                currentStage={currentStage}
                currentStep={currentStep}
                totalSteps={totalSteps}
                activeAgents={activeAgents}
              />
              {agentLogs.length > 0 ? (
                <div className="mt-4">
                  <AgentActivityFeed logs={agentLogs} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 animate-pulse mb-4">
                    <BrainCircuit className="w-8 h-8 text-blue-500" />
                  </div>
                  <p className="text-zinc-400 animate-pulse">{t('projectDetail.generatingPlan')}</p>
                </div>
              )}
            </div>
          )}

          {/* Plan result */}
          <AnimatePresence mode="wait">
            {analysisResult && (
              <div>
                <PlanResultCard
                  result={analysisResult}
                  onLaunch={handleLaunch}
                  isLaunching={isLaunching}
                  isLaunched={isLaunched}
                  kanbanProgress={kanbanProgress.total > 0 ? kanbanProgress : null}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {!isRunning && !prepareResult && !analysisResult && !implementResult && agentLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BrainCircuit className="w-12 h-12 text-zinc-800 mb-4" />
              <h2 className="text-lg font-bold text-zinc-400 mb-2">{project.name}</h2>
              <p className="text-sm text-zinc-600 mb-6">{project.description}</p>
              <p className="text-xs text-zinc-700">Click &quot;Run Agents&quot; to start the analysis pipeline.</p>
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
            onRetry={handleResumeImplement}
          />

          {/* Implementation result summary */}
          {implementResult && (
            <div className="px-4 pb-4">
              <ImplementResultCard
                result={implementResult}
                projectId={projectId}
                onDeployStart={handleDeployToProduction}
                isDeploying={isDeploying}
                deployResult={deployResult}
                previewStatus={previewStatus}
                onPreviewStart={handlePreviewStart}
                onPreviewStop={handlePreviewStop}
                onPreviewOpen={handlePreviewOpen}
                onPushPR={handlePushPR}
                isPushingPR={isPushingPR}
                pushPRResult={pushPRResult}
                onRetry={handleResumeImplement}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
