-- Migration 007: Implementation Plans and Code Artifacts
--
-- Stores the implementation DAG, individual tasks, and code artifacts
-- produced by developer agents.

CREATE TABLE IF NOT EXISTS implementation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id uuid,
  dag jsonb NOT NULL,
  summary text,
  architecture_notes text,
  status text CHECK (status IN ('planning', 'executing', 'completed', 'failed')) DEFAULT 'planning',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS implementation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES implementation_plans(id) ON DELETE CASCADE,
  agent_template text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  depends_on text[] DEFAULT '{}',
  tools text[] DEFAULT '{}',
  skills text[] DEFAULT '{}',
  specialization text,
  estimated_files text[] DEFAULT '{}',
  status text CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  output jsonb,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS code_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES implementation_tasks(id) ON DELETE CASCADE,
  type text CHECK (type IN ('file_created', 'file_modified', 'pr_created', 'test_result', 'command_output')) NOT NULL,
  file_path text,
  content text,
  pr_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_impl_plans_project ON implementation_plans (project_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_plan ON implementation_tasks (plan_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_status ON implementation_tasks (status);
CREATE INDEX IF NOT EXISTS idx_code_artifacts_task ON code_artifacts (task_id);

-- Extend projects table for implementation tracking
ALTER TABLE projects ADD COLUMN IF NOT EXISTS implementation_plan_id uuid REFERENCES implementation_plans(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pr_url text;

-- Extend status enum (if using CHECK constraint)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'analyzing', 'planned', 'implementing', 'active', 'archived'));

-- Extend agent_runs stage
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_stage_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_stage_check
  CHECK (stage IN ('prepare', 'plan', 'implement'));
