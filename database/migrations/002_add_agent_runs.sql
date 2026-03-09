-- Migration 002: Add agent_runs table for Agent execution history
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  stage text CHECK (stage IN ('prepare', 'plan')) NOT NULL,
  status text CHECK (status IN ('running', 'completed', 'failed')) DEFAULT 'running',
  input jsonb,
  output jsonb,
  started_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  completed_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs (status);
