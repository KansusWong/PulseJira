export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'analyzing' | 'planned' | 'implementing' | 'implemented' | 'deploying' | 'deployed' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
  signal_id?: string;
  prepare_result?: any;
  plan_result?: any;
  /** Populated after implement pipeline completes. */
  implement_result?: ImplementResultSummary | null;
  pr_url?: string;
  pr_number?: number;
  workspace_id?: string;
  deployment_url?: string;
  deployment_status?: string;
  deployed_at?: string;
  implementation_plan?: any;
  /** True for L2 (lightweight POC/demo) projects created via chat. */
  is_light?: boolean;
  /** Conversation that originated this project. */
  conversation_id?: string;
}

/** Stored on the project after implement pipeline finishes. */
export interface ImplementResultSummary {
  status: 'success' | 'partial' | 'failed';
  summary: string;
  prUrl: string | null;
  prNumber: number | null;
  tasksCompleted: number;
  tasksTotal: number;
  filesChanged: string[];
  testsPassing: boolean | null;
}

export interface CreateProjectInput {
  name: string;
  description: string;
  urls?: string[];
  is_light?: boolean;
  conversation_id?: string;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
  type: 'feature' | 'bug' | 'chore';
  priority: 'high' | 'medium' | 'low';
  affected_files?: string[];
  created_at: string;
}

export interface AgentRun {
  id: string;
  project_id: string;
  agent_name: string;
  stage: 'prepare' | 'plan' | 'implement' | 'deploy';
  status: 'running' | 'completed' | 'failed';
  input: any;
  output?: any;
  started_at: string;
  completed_at?: string;
}
