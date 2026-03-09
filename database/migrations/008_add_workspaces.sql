-- Migration 008: Workspaces — sandboxed git directories for agent code generation.

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  repo_url text NOT NULL,
  branch_name text NOT NULL,
  base_branch text NOT NULL DEFAULT 'main',
  local_path text NOT NULL,
  status text CHECK (status IN ('initializing', 'ready', 'executing', 'completed', 'failed', 'cleaned')) DEFAULT 'initializing',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_workspaces_project ON workspaces (project_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces (status);
