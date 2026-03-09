-- Migration 013: Add llm_usage table for token usage tracking
CREATE TABLE IF NOT EXISTS llm_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  agent_name text NOT NULL,
  model text,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  used_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_project_used_at ON llm_usage (project_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_used_at ON llm_usage (used_at DESC);
