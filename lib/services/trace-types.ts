export interface ExecutionTrace {
  trace_id: string;
  project_id: string;
  stage: 'prepare' | 'plan' | 'implement' | 'deploy' | 'meta';
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  summary: TraceSummary | null;
}

export interface TraceSummary {
  total_events?: number;
  agents?: string[];
  error?: string;
  [key: string]: any;
}

export interface ExecutionEvent {
  id: number;
  trace_id: string;
  seq: number;
  event_type: string;
  agent_name: string | null;
  payload: any;
  created_at: string;
}
