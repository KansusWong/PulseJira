-- 036: Automation pipelines and runs
-- Supports cron-scheduled and webhook-triggered automated pipelines.

CREATE TABLE IF NOT EXISTS automation_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron', 'webhook')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  task_design TEXT NOT NULL,
  variables_schema JSONB DEFAULT '{}',
  variables JSONB DEFAULT '{}',
  execution_config JSONB DEFAULT '{"max_iterations": 30, "timeout_minutes": 60}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID REFERENCES automation_pipelines(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_payload JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_automation_pipelines_agent_id ON automation_pipelines(agent_id);
CREATE INDEX IF NOT EXISTS idx_automation_pipelines_status ON automation_pipelines(status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_pipeline_id ON automation_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_created_at ON automation_runs(created_at DESC);
