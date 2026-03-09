-- Migration 020: Shared Blackboard for inter-agent state
--
-- Stores blackboard entries produced by agents during pipeline execution.
-- Enables pipeline resume and audit trail of agent collaboration.

CREATE TABLE IF NOT EXISTS blackboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'decision', 'artifact', 'question', 'status',
    'constraint', 'context', 'feedback'
  )),
  key text NOT NULL,
  value jsonb NOT NULL,
  author text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  tags text[] DEFAULT '{}',
  supersedes uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bb_execution ON blackboard_entries (execution_id);
CREATE INDEX IF NOT EXISTS idx_bb_project ON blackboard_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_bb_exec_key ON blackboard_entries (execution_id, key);
CREATE INDEX IF NOT EXISTS idx_bb_exec_type ON blackboard_entries (execution_id, type);
CREATE INDEX IF NOT EXISTS idx_bb_tags ON blackboard_entries USING GIN (tags);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bb_exec_key_version
  ON blackboard_entries (execution_id, key, version);
