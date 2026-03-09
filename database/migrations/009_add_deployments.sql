-- Migration 009: Deployment tracking
--
-- Stores deployment records produced by the deploy pipeline:
-- auto-merge → deploy → health check → rollback.

CREATE TABLE IF NOT EXISTS deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  pr_number integer NOT NULL,
  pr_url text NOT NULL,
  merged_at timestamp with time zone,
  target text CHECK (target IN ('vercel', 'github-pages', 'custom')) NOT NULL DEFAULT 'vercel',
  deployment_id text,           -- platform-specific ID
  deployment_url text,          -- live URL
  inspector_url text,           -- build log / inspector URL
  state text CHECK (state IN (
    'pending', 'merging', 'deploying', 'verifying', 'success', 'failed', 'rolled_back'
  )) DEFAULT 'pending',
  health_check jsonb,           -- { healthy, status, latencyMs, checkedAt }
  error text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments (project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_state ON deployments (state);

-- Extend projects table for deployment tracking
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deployment_id uuid REFERENCES deployments(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deployment_url text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deployment_status text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deployed_at timestamp with time zone;

-- Extend project status to include 'deploying' and 'deployed'
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS implement_result jsonb;

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'analyzing', 'planned', 'implementing', 'implemented', 'deploying', 'deployed', 'active', 'archived'));

-- Extend agent_runs stage to include 'deploy'
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_stage_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_stage_check
  CHECK (stage IN ('prepare', 'plan', 'implement', 'deploy'));
