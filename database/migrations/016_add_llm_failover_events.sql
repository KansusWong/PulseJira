-- Migration 016: Track LLM pool failover/switch events for observability and debugging
CREATE TABLE IF NOT EXISTS llm_failover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  agent_name text,
  model text,
  event_type text NOT NULL CHECK (event_type IN ('switch', 'exhausted')),
  from_account_id text,
  from_account_name text,
  to_account_id text,
  to_account_name text,
  reason text,
  error_status integer,
  error_code text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_llm_failover_events_project_created
  ON llm_failover_events (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_failover_events_event_created
  ON llm_failover_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_failover_events_from_account_created
  ON llm_failover_events (from_account_id, created_at DESC);
