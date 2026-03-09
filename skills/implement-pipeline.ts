/**
 * Implementation Pipeline — autonomous code generation and PR creation.
 *
 * Lifecycle:
 * 1. Orchestrator Agent analyzes PRD → outputs implementation DAG
 * 2. Workspace Manager creates sandboxed git environment
 * 3. For each task in DAG (topological order, respecting dependencies):
 *    a. Resolve required skills (local-first, then remote)
 *    b. Create workspace-scoped tools for the agent
 *    c. Create and run the agent (ReAct loop)
 *    d. Record artifacts
 * 4. QA Agent validates the result
 * 5. If passing → git push + create PR
 */

import fs from 'fs';
import path from 'path';
import { messageBus } from '@/connectors/bus/message-bus';
import { workspaceManager } from '@/lib/sandbox/workspace-manager';
import { GitWorkspace } from '@/lib/sandbox/git-workspace';
import { supabase } from '@/lib/db/client';
import { createPlannerAgent } from '@/agents/planner';
import { createDeveloperAgent } from '@/agents/developer';
import { createReviewerAgent } from '@/agents/reviewer';
import { resolveSkills } from '@/lib/skills/skill-registry';
import { fetchRemoteSkill } from '@/lib/skills/skill-fetcher';
import { CodeWriteTool } from '@/lib/tools/code-write';
import { CodeEditTool } from '@/lib/tools/code-edit';
import { GitCommitTool } from '@/lib/tools/git-commit';
import { GitCreatePRTool } from '@/lib/tools/git-create-pr';
import { RunCommandTool } from '@/lib/tools/run-command';
import { RunTestsTool } from '@/lib/tools/run-tests';
import { FinishImplementationTool } from '@/lib/tools/finish-implementation';
import { FileReadTool } from '@/lib/tools/fs-read';
import { FileListTool } from '@/lib/tools/fs-list';
import { RAGRetrieveTool } from '@/lib/tools/rag-retrieve';
import { SearchCodePatternsTool } from '@/lib/tools/search-code-patterns';
import { DiscoverSkillsTool } from '@/lib/tools/discover-skills';
import { BlackboardReadTool } from '@/lib/tools/blackboard-read';
import { BlackboardWriteTool } from '@/lib/tools/blackboard-write';
import { Blackboard } from '@/lib/blackboard';
import { extractAndStorePatterns } from '@/lib/services/pattern-extractor';
import { generateJSON, isQuotaOrRateLimitError } from '@/lib/core/llm';
import type { Workspace, ImplementationPlan, ImplementationTask, TaskValidation } from '@/lib/sandbox/types';
import type { BaseTool } from '@/lib/core/base-tool';
import type OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImplementPipelineInput {
  projectId: string;
  prd: any;
  planResult: any;
  repoUrl?: string;
  baseBranch?: string;
  /** Local-only mode: project subfolder name (no git remote). */
  localDir?: string;
  /** Previously generated implementation plan — skip orchestrator if provided. */
  previousPlan?: ImplementationPlan | null;
}

export interface ImplementResult {
  plan: ImplementationPlan | null;
  workspace: Workspace | null;
  prUrl: string | null;
  prNumber: number | null;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  /** Files changed across all tasks. */
  filesChanged: string[];
  /** Whether tests passed in QA step (null if QA didn't run). */
  testsPassing: boolean | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRepoOwnerName(repoUrl: string): { owner: string; repo: string } | null {
  // Supports: https://github.com/owner/repo.git or git@github.com:owner/repo.git
  const httpsMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  const sshMatch = repoUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  return null;
}

/**
 * Topological sort of tasks based on depends_on.
 * Returns tasks in execution order.
 */
function topoSort(tasks: ImplementationTask[]): ImplementationTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const sorted: ImplementationTask[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const task = taskMap.get(id);
    if (!task) return;
    for (const dep of task.dependsOn) {
      visit(dep);
    }
    sorted.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return sorted;
}

/**
 * Create workspace-scoped tools for a developer/QA/reviewer agent.
 */
function createWorkspaceTools(
  workspace: Workspace,
  repoInfo: { owner: string; repo: string } | null,
  blackboard?: Blackboard,
  agentName?: string,
): BaseTool[] {
  const cwd = workspace.localPath;
  const tools: BaseTool[] = [
    new FileListTool(),
    new FileReadTool(),
    new CodeWriteTool(cwd),
    new CodeEditTool(cwd),
    new GitCommitTool(cwd),
    new RunCommandTool(cwd),
    new RunTestsTool(cwd),
    new FinishImplementationTool(),
    new RAGRetrieveTool(),
    new SearchCodePatternsTool(),
  ];

  if (repoInfo) {
    tools.push(new GitCreatePRTool(cwd, repoInfo.owner, repoInfo.repo, workspace.branchName));
  }

  if (blackboard) {
    tools.push(new BlackboardReadTool(blackboard));
    if (agentName) {
      tools.push(new BlackboardWriteTool(blackboard, agentName));
    }
  }

  return tools;
}

/**
 * Scan a workspace directory for existing source files (non-hidden, non-node_modules).
 * Returns relative paths for injection into agent context.
 */
function scanExistingFiles(dir: string, maxFiles = 80): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const ignoreDirs = new Set(['.git', 'node_modules', '.next', 'dist', '.cache', '__pycache__']);

  function walk(current: string, prefix: string) {
    if (results.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (results.length >= maxFiles) return;
      if (e.name.startsWith('.') && e.isDirectory()) continue;
      if (ignoreDirs.has(e.name)) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(path.join(current, e.name), rel);
      } else {
        results.push(rel);
      }
    }
  }

  walk(dir, '');
  return results;
}

/**
 * Persist the current implementation plan to the database.
 * Fire-and-forget — never blocks the pipeline on DB write failures.
 */
async function savePlanToDB(projectId: string, plan: ImplementationPlan) {
  await supabase
    .from('projects')
    .update({ implementation_plan: plan })
    .eq('id', projectId);
}

// ---------------------------------------------------------------------------
// Complexity → maxLoops mapping
// ---------------------------------------------------------------------------

const COMPLEXITY_LOOPS: Record<string, number> = {
  low: 15,
  medium: 20,
  high: 30,
};
const DEFAULT_LOOPS = 20;
const HARD_CAP_LOOPS = 50;

function complexityToMaxLoops(complexity?: string): number {
  return COMPLEXITY_LOOPS[complexity || ''] ?? DEFAULT_LOOPS;
}

// ---------------------------------------------------------------------------
// Architect budget evaluator (single-shot LLM call, no ReAct loop)
// ---------------------------------------------------------------------------

interface BudgetDecision {
  action: 'extend' | 'fail';
  newMaxLoops?: number;
  reason: string;
}

async function evaluateTaskBudget(params: {
  taskTitle: string;
  taskDescription: string;
  stepsUsed: number;
  currentMaxLoops: number;
  lastProgress: string;
  projectId?: string;
  recordUsage?: (u: { agentName: string; projectId?: string; model?: string; prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
}): Promise<BudgetDecision> {
  const systemPrompt = `你是 Architect，系统的动态执行大脑。
你的职责是评估一个未完成的开发任务是否需要更多执行步数。

评估原则：
- 如果任务描述复杂度高、涉及多文件、且已有明显进展（已创建文件/写了代码），应该追加预算
- 如果任务简单但仍未完成，可能是 Agent 陷入了循环或走入歧途，应拒绝追加
- 追加预算 = 当前已用步数的 50%~100%，但总量不超过 ${HARD_CAP_LOOPS}
- 每个任务只有一次追加机会

返回 JSON：
{ "action": "extend" | "fail", "newMaxLoops": <number>, "reason": "<brief explanation>" }
其中 newMaxLoops 是追加的额外步数（不是总数）。仅当 action 为 "extend" 时需要。`;

  const userContent = `## 任务信息
标题: ${params.taskTitle}
描述: ${params.taskDescription}

## 执行状态
已用步数: ${params.stepsUsed}
当前预算: ${params.currentMaxLoops}
硬上限: ${HARD_CAP_LOOPS}

## 最后进展
${params.lastProgress.slice(0, 2000)}

请决定是否追加预算。`;

  try {
    const result = await generateJSON(systemPrompt, userContent, {
      onUsage: params.recordUsage
        ? (usage) => params.recordUsage!({
            agentName: 'architect',
            projectId: params.projectId,
            model: usage.model,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          })
        : undefined,
    });
    const decision = result as BudgetDecision;
    if (decision.action === 'extend') {
      const extra = Math.min(
        decision.newMaxLoops || params.stepsUsed,
        HARD_CAP_LOOPS - params.stepsUsed,
      );
      if (extra <= 0) {
        return { action: 'fail', reason: `Hard cap (${HARD_CAP_LOOPS}) reached.` };
      }
      return { action: 'extend', newMaxLoops: extra, reason: decision.reason };
    }
    return { action: 'fail', reason: decision.reason || 'Architect declined extension.' };
  } catch (e: any) {
    return { action: 'fail', reason: `Budget evaluation error: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Per-task QA gate — lightweight completeness check after each task
// ---------------------------------------------------------------------------

const COMPLETENESS_THRESHOLD = 60;

async function validateTaskOutput(params: {
  taskTitle: string;
  taskDescription: string;
  agentTemplate: string;
  output: any;
  projectId?: string;
  recordUsage?: (u: { agentName: string; projectId?: string; model?: string; prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
}): Promise<TaskValidation> {
  const { taskTitle, taskDescription, agentTemplate, output } = params;
  const issues: string[] = [];

  // --- Phase 1: Programmatic structural checks ---
  if (!output || typeof output !== 'object') {
    return { passed: false, completeness: 0, issues: ['Output is empty or not an object'], retryHint: 'The agent produced no structured output. Re-execute the task and ensure finish_implementation is called with all required fields.' };
  }

  if (!output.summary || output.summary.trim().length < 10) {
    issues.push('Summary is missing or too short');
  }

  if (agentTemplate === 'developer') {
    if (!output.files_changed || !Array.isArray(output.files_changed) || output.files_changed.length === 0) {
      issues.push('No files_changed reported — developer task should produce file changes');
    }
    if (output.tests_passing === false) {
      issues.push('Tests are failing after implementation');
    }
  }

  // Fast-fail: if structural issues are severe, skip LLM call
  if (!output.summary && (!output.files_changed || output.files_changed.length === 0)) {
    return {
      passed: false,
      completeness: 10,
      issues,
      retryHint: `Task "${taskTitle}" produced no meaningful output (no summary, no files changed). Re-read the task description carefully and implement what is required.`,
    };
  }

  // --- Phase 2: LLM semantic completeness check (single-shot, cheap) ---
  try {
    const systemPrompt = `你是一个严格的 QA 审核员。你的工作是判断一个开发任务的产出是否真正完成了任务描述中要求的内容。

评分标准：
- 100: 完全完成，所有要求都已实现
- 70-99: 基本完成，核心功能已实现但有小的遗漏
- 40-69: 部分完成，有重要功能未实现
- 0-39: 严重不完整，大部分要求未满足

关注点：
- 产出的文件列表是否覆盖了任务描述中提到的所有组件/模块
- summary 描述的工作是否真正回应了任务的核心要求
- 是否有明显的遗漏（任务要求了 A、B、C，但产出只提到 A）

返回 JSON：{ "completeness": <0-100>, "issues": ["issue1", ...], "shouldRetry": <boolean> }
其中 shouldRetry 为 true 表示遗漏严重到值得重试（completeness < ${COMPLETENESS_THRESHOLD}）。`;

    const userContent = `## 任务
标题: ${taskTitle}
描述: ${taskDescription}

## Agent 产出
类型: ${agentTemplate}
Summary: ${output.summary || '(empty)'}
Files changed: ${JSON.stringify(output.files_changed || [])}
Tests passing: ${output.tests_passing ?? 'unknown'}
Issues reported: ${JSON.stringify(output.issues || [])}`;

    const result = await generateJSON(systemPrompt, userContent, {
      onUsage: params.recordUsage
        ? (usage) => params.recordUsage!({
            agentName: 'qa_validator',
            projectId: params.projectId,
            model: usage.model,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          })
        : undefined,
    }) as any;
    const llmIssues: string[] = result.issues || [];
    const completeness: number = Math.max(0, Math.min(100, result.completeness ?? 50));
    const allIssues = [...issues, ...llmIssues];
    const passed = completeness >= COMPLETENESS_THRESHOLD && !issues.some(i => i.includes('Tests are failing'));

    return {
      passed,
      completeness,
      issues: allIssues,
      retryHint: !passed
        ? `QA gate failed (completeness: ${completeness}/100). Issues:\n${allIssues.map(i => `- ${i}`).join('\n')}\n\nRe-implement focusing on the missing parts. Do NOT repeat already completed work.`
        : undefined,
    };
  } catch (e: any) {
    // LLM call failed — fall back to programmatic result only
    const hasStructuralIssues = issues.length > 0;
    return {
      passed: !hasStructuralIssues,
      completeness: hasStructuralIssues ? 40 : 70,
      issues: [...issues, `QA LLM check skipped: ${e.message}`],
    };
  }
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

export async function runImplementation(
  input: ImplementPipelineInput,
  context: {
    logger?: (msg: string) => Promise<void> | void;
    recordUsage?: (params: {
      agentName: string;
      projectId?: string;
      model?: string;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    }) => void;
  } = {}
): Promise<ImplementResult> {
  const log = context.logger || console.log;
  const recordUsage = context.recordUsage;
  const { projectId, prd, planResult, repoUrl, baseBranch, localDir, previousPlan } = input;
  const agentCtx = {
    projectId,
    logger: messageBus.createLogger('orchestrator'),
    recordUsage,
  };
  const isLocalMode = !!localDir && !repoUrl;

  let workspace: Workspace | null = null;
  let plan: ImplementationPlan | null = null;
  let prUrl: string | null = null;
  let prNumber: number | null = null;

  try {
    // -----------------------------------------------------------------
    // Step 1: Orchestrator creates implementation DAG (or reuse previous)
    // -----------------------------------------------------------------

    const hasPreviousTasks = previousPlan?.tasks && previousPlan.tasks.length > 0;
    const pendingTasks = hasPreviousTasks
      ? previousPlan!.tasks.filter((t) => t.status !== 'completed')
      : [];
    const isResume = hasPreviousTasks && pendingTasks.length > 0;

    // Pre-scan: check if the target workspace already has files from a previous run.
    // This info is injected into the orchestrator so it avoids duplicating work.
    let existingFileSummary = '';
    if (isLocalMode && !isResume) {
      const targetDir = path.join(process.cwd(), 'projects', localDir!);
      const existing = scanExistingFiles(targetDir);
      if (existing.length > 0) {
        existingFileSummary = [
          `\n\n## 已有项目文件（上次执行的残留，共 ${existing.length} 个）`,
          ...existing.map((f) => `- ${f}`),
          '',
          '请在生成实现计划时考虑这些已有文件。',
          '对于已有文件对应的功能，如果实现完整则跳过该任务，如果需要补充则保留任务并在 description 中注明需要修改而非新建。',
          '专注于缺失的部分。',
        ].join('\n');
        await log(`[implement] Found ${existing.length} existing files in workspace — injecting context for orchestrator.`);
      }
    }

    if (isResume) {
      await log(`[implement] Resuming previous plan — ${pendingTasks.length} tasks remaining (${previousPlan!.tasks.length - pendingTasks.length} already completed).`);

      // Reset failed/running tasks to pending for retry
      const tasks: ImplementationTask[] = previousPlan!.tasks.map((t) => ({
        ...t,
        status: t.status === 'completed' ? 'completed' as const : 'pending' as const,
        output: t.status === 'completed' ? t.output : undefined,
        startedAt: t.status === 'completed' ? t.startedAt : undefined,
        completedAt: t.status === 'completed' ? t.completedAt : undefined,
      }));

      plan = {
        ...previousPlan!,
        tasks,
        status: 'executing',
      };

      messageBus.agentStart('orchestrator', 1, 5);
      messageBus.agentComplete('orchestrator', { resumed: true, tasksRemaining: pendingTasks.length });
    } else {
      await log('[implement] Starting orchestration...');
      messageBus.agentStart('orchestrator', 1, 5);

      const orchestratorContext = `PRD:\n${JSON.stringify(prd, null, 2)}\n\nPlan Tasks:\n${JSON.stringify(planResult?.tasks || [], null, 2)}${existingFileSummary}`;

      const orchestrator = createPlannerAgent({
        mode: 'implementation-dag',
        context: orchestratorContext,
        extraTools: [new DiscoverSkillsTool()],
      });

      const orchestratorResult = await orchestrator.run(
        `基于以下 PRD 和任务计划，生成一份详细的自动化实现计划（implementation DAG）。\n\nPRD:\n${JSON.stringify(prd, null, 2)}\n\n任务:\n${JSON.stringify(planResult?.tasks || [], null, 2)}${existingFileSummary}`,
        agentCtx
      );

      messageBus.agentComplete('orchestrator', orchestratorResult);

      const tasks: ImplementationTask[] = (orchestratorResult?.tasks || []).map(
        (t: any, i: number) => ({
          id: t.id || `task-${i + 1}`,
          planId: '',
          agentTemplate: t.agent_template || 'developer',
          title: t.title,
          description: t.description,
          dependsOn: t.depends_on || [],
          tools: t.tools || [],
          skills: t.skills || [],
          specialization: t.specialization,
          estimatedFiles: t.estimated_files || [],
          maxLoops: complexityToMaxLoops(t.estimated_complexity),
          status: 'pending' as const,
        })
      );

      plan = {
        id: crypto.randomUUID(),
        projectId,
        workspaceId: '',
        tasks,
        summary: orchestratorResult?.summary || '',
        architectureNotes: orchestratorResult?.architecture_notes,
        status: 'executing',
        createdAt: new Date().toISOString(),
      };
    }

    // Persist plan immediately so resume works even if pipeline crashes later
    savePlanToDB(projectId, plan).catch((err) =>
      console.error('[implement] Failed to save initial plan:', err)
    );

    if (plan.tasks.length === 0) {
      await log('[implement] Orchestrator produced no tasks. Aborting.');
      return { plan, workspace, prUrl, prNumber, status: 'failed', summary: 'No tasks generated', filesChanged: [], testsPassing: null };
    }

    const activeTasks = plan.tasks.filter((t) => t.status !== 'completed');
    await log(`[implement] Plan: ${plan.tasks.length} tasks total, ${activeTasks.length} to execute.`);

    // Broadcast ALL tasks upfront so the frontend can render the full list
    for (let i = 0; i < plan.tasks.length; i++) {
      const t = plan.tasks[i];
      const broadcastStatus = t.status === 'completed' ? 'completed' : 'pending';
      messageBus.taskUpdate(t.id, t.title, broadcastStatus, i + 1, plan.tasks.length);
    }

    // Dynamic total: orchestrator(1) + workspace(1) + N tasks + QA(1) + PR(1)
    const dynamicTotal = plan.tasks.length + 4;

    // -----------------------------------------------------------------
    // Step 2: Create sandboxed workspace
    // -----------------------------------------------------------------
    await log('[implement] Setting up workspace...');
    messageBus.agentStart('developer', 2, dynamicTotal);

    if (isLocalMode) {
      workspace = await workspaceManager.create({
        projectId,
        localDir,
      });
    } else {
      workspace = await workspaceManager.create({
        projectId,
        repoUrl: repoUrl!,
        baseBranch,
      });
    }

    if (workspace.status !== 'ready') {
      await log(`[implement] Workspace creation failed: ${workspace.status}`);
      return { plan, workspace, prUrl, prNumber, status: 'failed', summary: 'Workspace creation failed', filesChanged: [], testsPassing: null };
    }

    plan.workspaceId = workspace.id;
    const repoInfo = isLocalMode ? null : parseRepoOwnerName(repoUrl!);

    // --- Shared Blackboard: inter-agent state space ---
    const blackboard = new Blackboard(plan.id, projectId, { maxEntries: 200, ttlMs: 2 * 60 * 60 * 1000 });
    if (isResume) {
      await blackboard.hydrate();
      await log(`[implement] Blackboard hydrated: ${blackboard.size} entries restored.`);
    }
    await blackboard.write({ key: 'pipeline.prd', value: prd, type: 'artifact', author: 'orchestrator' });
    await blackboard.write({
      key: 'pipeline.plan',
      value: { summary: plan.summary, taskCount: plan.tasks.length, architectureNotes: plan.architectureNotes },
      type: 'artifact',
      author: 'orchestrator',
    });

    const wsTools = createWorkspaceTools(workspace, repoInfo, blackboard);

    await log(`[implement] Workspace ready: ${workspace.localPath}`);

    // -----------------------------------------------------------------
    // Step 3: Execute tasks in topological order
    // -----------------------------------------------------------------
    const sortedTasks = topoSort(plan.tasks);
    const completedTasks = new Set<string>(
      plan.tasks.filter((t) => t.status === 'completed').map((t) => t.id)
    );
    let failedCount = 0;
    let pausedForQuota = false;
    let pauseReason: string | null = null;

    for (let i = 0; i < sortedTasks.length; i++) {
      const task = sortedTasks[i];

      // Skip already-completed tasks (from previous run)
      if (task.status === 'completed') {
        await log(`[implement] Task ${i + 1}/${sortedTasks.length}: "${task.title}" — already completed, skipping.`);
        messageBus.taskUpdate(task.id, task.title, 'completed', i + 1, sortedTasks.length);
        continue;
      }

      // Check dependencies
      const unmetDeps = task.dependsOn.filter((d) => !completedTasks.has(d));
      if (unmetDeps.length > 0) {
        await log(`[implement] Skipping "${task.title}" — unmet deps: ${unmetDeps.join(', ')}`);
        task.status = 'failed';
        messageBus.taskUpdate(task.id, task.title, 'failed', i + 1, sortedTasks.length);
        failedCount++;
        continue;
      }

      const taskLoops = task.maxLoops || DEFAULT_LOOPS;
      await log(`[implement] Task ${i + 1}/${sortedTasks.length}: ${task.title} (budget: ${taskLoops} loops)`);
      messageBus.agentStart(task.agentTemplate, 3 + i, dynamicTotal);
      messageBus.taskUpdate(task.id, task.title, 'running', i + 1, sortedTasks.length);
      task.status = 'running';
      task.startedAt = new Date().toISOString();

      try {
        const skills = await resolveSkills(task.skills, fetchRemoteSkill);
        const loggerCtx = { taskId: task.id, taskTitle: task.title };

        // --- Enrich task description with upstream context from blackboard ---
        let enrichedDescription = task.description;
        if (task.dependsOn.length > 0) {
          const depResults = task.dependsOn
            .map((depId) => blackboard.read(`task.${depId}.result`))
            .filter(Boolean);
          if (depResults.length > 0) {
            enrichedDescription += '\n\n## Context from upstream tasks:\n';
            for (const dep of depResults) {
              enrichedDescription += `\n### ${(dep!.value as any)?.title || dep!.key}\n${JSON.stringify(dep!.value, null, 2)}\n`;
            }
          }
        }
        const decisions = blackboard.query({ type: 'decision', limit: 5 });
        if (decisions.length > 0) {
          enrichedDescription += '\n\n## Key decisions made so far:\n';
          for (const d of decisions) {
            enrichedDescription += `- [${d.key}] ${typeof d.value === 'string' ? d.value : JSON.stringify(d.value)}\n`;
          }
        }

        // --- Helper: run the agent with given loops and optional conversation context ---
        // Per-task tools: shared wsTools + per-agent blackboard write tool
        const taskTools = [...wsTools, new BlackboardWriteTool(blackboard, task.agentTemplate)];

        const runAgent = async (
          loops: number,
          prevMessages?: OpenAI.Chat.ChatCompletionMessageParam[],
        ): Promise<any> => {
          const agentLogName = (task.agentTemplate === 'qa-engineer' || task.agentTemplate === 'qa') ? 'reviewer' : (task.agentTemplate === 'code-reviewer' || task.agentTemplate === 'reviewer') ? 'reviewer' : 'developer';
          const ctx = { projectId, recordUsage, logger: messageBus.createLogger(agentLogName, loggerCtx) };
          if (task.agentTemplate === 'qa-engineer' || task.agentTemplate === 'qa') {
            return createReviewerAgent({ mode: 'qa', taskDescription: enrichedDescription, tools: taskTools, maxLoops: loops, initialMessages: prevMessages })
              .run(enrichedDescription, ctx);
          }
          if (task.agentTemplate === 'code-reviewer' || task.agentTemplate === 'reviewer') {
            return createReviewerAgent({ mode: 'review', taskDescription: enrichedDescription, tools: taskTools, maxLoops: loops, initialMessages: prevMessages })
              .run(enrichedDescription, ctx);
          }
          return createDeveloperAgent({
            specialization: task.specialization || 'fullstack',
            taskDescription: enrichedDescription,
            tools: taskTools,
            skills,
            maxLoops: loops,
            initialMessages: prevMessages,
          }).run(enrichedDescription, ctx);
        };

        let output = await runAgent(taskLoops);

        // --- Architect budget extension: if agent ran out of loops, ask for more ---
        if (output?.__incomplete && !task.budgetExtended) {
          await log(`[implement] Task "${task.title}" incomplete after ${output.stepsUsed} steps. Consulting Architect for budget extension...`);
          task.budgetExtended = true;

          const decision = await evaluateTaskBudget({
            taskTitle: task.title,
            taskDescription: task.description,
            stepsUsed: output.stepsUsed,
            currentMaxLoops: taskLoops,
            lastProgress: output.lastProgress || '',
            projectId,
            recordUsage,
          });

          if (decision.action === 'extend' && decision.newMaxLoops && decision.newMaxLoops > 0) {
            await log(`[implement] Architect granted ${decision.newMaxLoops} extra loops: ${decision.reason}`);
            messageBus.taskUpdate(task.id, task.title, 'running', i + 1, sortedTasks.length);
            output = await runAgent(decision.newMaxLoops, output.__messages);
          } else {
            await log(`[implement] Architect declined extension: ${decision.reason}`);
          }
        }

        // --- If still incomplete after extension, treat the partial result as completed ---
        if (output?.__incomplete) {
          await log(`[implement] Task "${task.title}" still incomplete — accepting partial result.`);
          const { __incomplete, __messages, ...partialOutput } = output;
          output = partialOutput;
        }

        // --- Per-task QA gate: validate output completeness ---
        if (task.agentTemplate !== 'qa-engineer' && task.agentTemplate !== 'code-reviewer') {
          await log(`[implement] Validating "${task.title}"...`);
          const validation = await validateTaskOutput({
            taskTitle: task.title,
            taskDescription: task.description,
            agentTemplate: task.agentTemplate,
            output,
            projectId,
            recordUsage,
          });
          task.validation = validation;

          if (!validation.passed) {
            await log(`[implement] QA gate: "${task.title}" — completeness ${validation.completeness}/100. Issues: ${validation.issues.join('; ')}`);

            // One retry allowed: re-run agent with QA feedback injected
            if (!task.qaRetried && validation.retryHint) {
              task.qaRetried = true;
              await log(`[implement] Retrying "${task.title}" with QA feedback...`);
              messageBus.taskUpdate(task.id, task.title, 'running', i + 1, sortedTasks.length);

              const retryMessage: OpenAI.Chat.ChatCompletionMessageParam = {
                role: 'user',
                content: `Your previous implementation was reviewed and found incomplete.\n\n${validation.retryHint}\n\nPlease fix the issues and call finish_implementation when done.`,
              };
              const retryLoops = Math.min(Math.ceil(taskLoops * 0.5), HARD_CAP_LOOPS - taskLoops);
              if (retryLoops > 0) {
                output = await runAgent(retryLoops, ([
                  { role: 'system' as const, content: (output as any)?.__systemPrompt || '' },
                  retryMessage,
                ].filter(m => (m as any).content)) as OpenAI.Chat.ChatCompletionMessageParam[]);

                if (output?.__incomplete) {
                  const { __incomplete, __messages, ...partial } = output;
                  output = partial;
                }

                // Re-validate after retry
                const retryValidation = await validateTaskOutput({
                  taskTitle: task.title,
                  taskDescription: task.description,
                  agentTemplate: task.agentTemplate,
                  output,
                  projectId,
                  recordUsage,
                });
                task.validation = retryValidation;
                await log(`[implement] Retry validation: "${task.title}" — completeness ${retryValidation.completeness}/100, passed=${retryValidation.passed}`);
              }
            }
          } else {
            await log(`[implement] QA gate passed: "${task.title}" — completeness ${validation.completeness}/100`);
          }
        }

        task.output = output;
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        completedTasks.add(task.id);

        // Write task result to shared blackboard
        blackboard.write({
          key: `task.${task.id}.result`,
          value: {
            title: task.title,
            status: task.status,
            summary: output?.summary || '',
            files_changed: output?.files_changed || [],
            tests_passing: output?.tests_passing ?? null,
            validation: task.validation || null,
          },
          type: 'status',
          author: task.agentTemplate,
          tags: [task.id, task.agentTemplate, 'task-result'],
        }).catch((err) => console.error('[implement-pipeline] Blackboard task-result write failed:', err));

        messageBus.agentComplete(task.agentTemplate, output);
        messageBus.taskUpdate(task.id, task.title, 'completed', i + 1, sortedTasks.length);
        const qualityTag = task.validation && !task.validation.passed ? ' (partial — QA gate failed)' : '';
        await log(`[implement] ✓ "${task.title}" completed${qualityTag}.`);

        savePlanToDB(projectId, plan).catch((err) => console.error('[implement-pipeline] Save plan failed:', err));

        extractAndStorePatterns({
          taskId: task.id,
          projectId,
          title: task.title,
          description: task.description,
          filesChanged: output?.files_changed || [],
          summary: output?.summary || '',
        }).catch((err) => console.error('[implement-pipeline] Extract patterns failed:', err));
      } catch (error: any) {
        const message = error?.message || String(error);

        if (isQuotaOrRateLimitError(error)) {
          pausedForQuota = true;
          pauseReason = message;

          task.status = 'pending';
          task.output = {
            error: message,
            recoverable: true,
            reason: 'quota_or_rate_limit',
            pausedAt: new Date().toISOString(),
          };

          messageBus.taskUpdate(task.id, task.title, 'pending', i + 1, sortedTasks.length);
          await log(`[implement] ⏸ "${task.title}" paused due to quota/rate limit: ${message}`);
          messageBus.agentComplete(task.agentTemplate, { paused: true, reason: 'quota_or_rate_limit', error: message });

          savePlanToDB(projectId, plan).catch((err) => console.error('[implement-pipeline] Save plan (quota pause) failed:', err));
          break;
        }

        task.status = 'failed';
        task.output = { error: message };
        failedCount++;
        messageBus.taskUpdate(task.id, task.title, 'failed', i + 1, sortedTasks.length);
        await log(`[implement] ✗ "${task.title}" failed: ${message}`);
        messageBus.agentComplete(task.agentTemplate, { error: message });

        savePlanToDB(projectId, plan).catch((err) => console.error('[implement-pipeline] Save plan (task error) failed:', err));
      }
    }

    // -----------------------------------------------------------------
    // Step 4: QA validation (if not already in the DAG)
    // -----------------------------------------------------------------
    const hasQA = sortedTasks.some((t) => t.agentTemplate === 'qa-engineer');
    if (!hasQA && failedCount === 0 && !pausedForQuota) {
      await log('[implement] Running QA validation...');
      messageBus.agentStart('qa-engineer', dynamicTotal - 1, dynamicTotal);

      try {
        const qaAgent = createReviewerAgent({
          mode: 'qa',
          taskDescription: '验证所有代码变更是否正确，运行测试套件。',
          tools: wsTools,
        });
        const qaResult = await qaAgent.run(
          '请运行测试并验证代码质量。',
          { projectId, recordUsage, logger: messageBus.createLogger('qa_engineer') }
        );
        messageBus.agentComplete('qa-engineer', qaResult);
        await log(`[implement] QA result: tests_passing=${qaResult?.tests_passing}`);
      } catch (error: any) {
        await log(`[implement] QA validation failed: ${error.message}`);
      }
    }

    // -----------------------------------------------------------------
    // Step 5: Create PR (if repo info available and tasks succeeded; skip in local mode)
    // -----------------------------------------------------------------
    if (!isLocalMode && repoInfo && failedCount === 0 && !pausedForQuota) {
      await log('[implement] Creating PR...');
      messageBus.agentStart('code-reviewer', dynamicTotal, dynamicTotal);

      try {
        const git = new GitWorkspace(workspace.localPath);
        await git.push();

        const { createPullRequest } = await import('@/connectors/external/github');
        const pr = await createPullRequest({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          head: workspace.branchName,
          base: workspace.baseBranch,
          title: `[Pulse] ${plan.summary || 'Automated implementation'}`,
          body: buildPRBody(plan),
        });

        if (pr) {
          prUrl = pr.html_url;
          prNumber = pr.number;
          await log(`[implement] PR created: ${prUrl}`);
        }
      } catch (error: any) {
        await log(`[implement] PR creation failed: ${error.message}`);
      }

      messageBus.agentComplete('code-reviewer', { prUrl });
    }

    // -----------------------------------------------------------------
    // Collect artifacts for review
    // -----------------------------------------------------------------
    const filesChanged: string[] = [];
    let testsPassing: boolean | null = null;

    for (const task of sortedTasks) {
      if (task.output?.files_changed) {
        filesChanged.push(...task.output.files_changed);
      }
      if (task.agentTemplate === 'qa-engineer' && task.output?.tests_passing !== undefined) {
        testsPassing = task.output.tests_passing;
      }
    }

    // -----------------------------------------------------------------
    // Finalize — pipeline stops here; deploy is user-triggered
    // -----------------------------------------------------------------
    const status = pausedForQuota
      ? 'partial'
      : failedCount === 0
        ? 'success'
        : failedCount < sortedTasks.length
          ? 'partial'
          : 'failed';

    plan.status = pausedForQuota ? 'executing' : status === 'success' ? 'completed' : 'failed';

    const summary = pausedForQuota
      ? `${completedTasks.size}/${sortedTasks.length} tasks completed, paused for quota/rate limit${pauseReason ? `: ${pauseReason}` : ''}`
      : `${completedTasks.size}/${sortedTasks.length} tasks completed${prUrl ? `, PR: ${prUrl}` : ''}`;
    await log(`[implement] Done: ${summary}`);

    messageBus.stageComplete('implement', { plan, prUrl }, 'orchestrator');

    return { plan, workspace, prUrl, prNumber, status, summary, filesChanged, testsPassing };
  } catch (error: any) {
    await log(`[implement] Pipeline error: ${error.message}`);
    return {
      plan,
      workspace,
      prUrl,
      prNumber,
      status: 'failed',
      summary: error.message,
      filesChanged: [],
      testsPassing: null,
    };
  }
}

// ---------------------------------------------------------------------------
// PR body builder
// ---------------------------------------------------------------------------

function buildPRBody(plan: ImplementationPlan): string {
  const lines: string[] = [
    '## Summary',
    plan.summary || 'Automated implementation by Pulse agents.',
    '',
  ];

  if (plan.architectureNotes) {
    lines.push('## Architecture Notes', plan.architectureNotes, '');
  }

  lines.push('## Tasks', '');
  for (const task of plan.tasks) {
    const icon = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳';
    lines.push(`- ${icon} **${task.title}** (${task.agentTemplate})`);
  }

  lines.push('', '---', '🤖 Generated by [Pulse](https://github.com) multi-agent pipeline');
  return lines.join('\n');
}
