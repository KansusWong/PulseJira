-- Sprint 8: Execution Trace persistence (O1)
-- Stores pipeline execution traces and granular SSE events for post-hoc analysis.

CREATE TABLE IF NOT EXISTS execution_traces (
  trace_id text PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('prepare', 'plan', 'implement', 'deploy', 'meta')),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')) DEFAULT 'running',
  started_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  completed_at timestamp with time zone,
  summary jsonb
);

CREATE INDEX idx_exec_traces_project ON execution_traces (project_id, started_at DESC);

CREATE TABLE IF NOT EXISTS execution_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trace_id text NOT NULL REFERENCES execution_traces(trace_id) ON DELETE CASCADE,
  seq integer NOT NULL,
  event_type text NOT NULL,
  agent_name text,
  payload jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_exec_events_trace_seq ON execution_events (trace_id, seq);
