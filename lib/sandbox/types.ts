/**
 * Sandbox type definitions — workspace and execution environment.
 */

export interface WorkspaceConfig {
  projectId: string;
  repoUrl?: string;
  baseBranch?: string;
  branchName?: string;
  /** Local-only mode: create a plain folder instead of cloning a repo. */
  localDir?: string;
}

export interface Workspace {
  id: string;
  projectId: string;
  repoUrl: string;
  branchName: string;
  baseBranch: string;
  localPath: string;
  status: 'initializing' | 'ready' | 'executing' | 'completed' | 'failed' | 'cleaned';
  createdAt: string;
  /** True when workspace is a plain local folder (no git remote). */
  isLocal?: boolean;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ImplementationTask {
  id: string;
  planId: string;
  agentTemplate: string;
  title: string;
  description: string;
  dependsOn: string[];
  tools: string[];
  skills: string[];
  specialization?: string;
  estimatedFiles?: string[];
  /** Architect/Orchestrator-assigned loop budget. Falls back to agent default when omitted. */
  maxLoops?: number;
  /** Whether the Architect already extended this task's budget (max once). */
  budgetExtended?: boolean;
  /** Whether a QA-gated retry has already been attempted (max once). */
  qaRetried?: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: any;
  /** Per-task QA validation result (null if validation was skipped). */
  validation?: TaskValidation | null;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskValidation {
  passed: boolean;
  completeness: number;
  issues: string[];
  retryHint?: string;
}

export interface ImplementationPlan {
  id: string;
  projectId: string;
  workspaceId: string;
  tasks: ImplementationTask[];
  summary: string;
  architectureNotes?: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: string;
}

export interface CodeArtifact {
  id: string;
  taskId: string;
  type: 'file_created' | 'file_modified' | 'pr_created' | 'test_result' | 'command_output';
  filePath?: string;
  content?: string;
  prUrl?: string;
  metadata: Record<string, any>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

export type DeployTarget = 'vercel' | 'github-pages' | 'custom';
export type DeployState =
  | 'pending'       // waiting for CI to pass
  | 'merging'       // auto-merging PR
  | 'deploying'     // deployment triggered, building
  | 'verifying'     // health check in progress
  | 'success'       // deployment live and healthy
  | 'failed'            // deployment or health check failed
  | 'rolled_back'       // fully rolled back after failure
  | 'rollback_pending'; // rollback needed but not yet automated

export interface DeploymentRecord {
  id: string;
  projectId: string;
  prNumber: number;
  prUrl: string;
  mergedAt?: string;
  target: DeployTarget;
  deploymentId?: string;        // platform-specific deployment ID
  deploymentUrl?: string;       // live URL
  inspectorUrl?: string;        // build log URL
  state: DeployState;
  healthCheck?: {
    healthy: boolean;
    status: number;
    latencyMs: number;
    checkedAt: string;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeployPipelineInput {
  projectId: string;
  workspace: Workspace;
  prNumber: number;
  prUrl: string;
  repoOwner: string;
  repoName: string;
  target: DeployTarget;
  /** Vercel project name or deploy hook URL */
  vercelProject?: string;
  vercelDeployHook?: string;
  /** Custom deploy command (for 'custom' target) */
  customDeployCommand?: string;
  /** Health check URL — if omitted, uses the deployment URL */
  healthCheckUrl?: string;
  /** Auto-rollback on health check failure (default: true) */
  autoRollback?: boolean;
}

export interface DeployResult {
  state: DeployState;
  deploymentUrl: string | null;
  mergedAt: string | null;
  healthCheck: DeploymentRecord['healthCheck'] | null;
  error: string | null;
}
