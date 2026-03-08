-- Migration 028: Add tool_approval_audits table for audit logging of tool approval events.
-- Pattern: simple event table with fire-and-forget insert + list query (cf. llm_failover_events).

CREATE TABLE IF NOT EXISTS tool_approval_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id text UNIQUE NOT NULL,
  conversation_id uuid,
  agent_name text NOT NULL,
  tool_name text NOT NULL,
  tool_args jsonb,
  status text NOT NULL CHECK (status IN ('requested','approved','rejected','timed_out')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text,            -- 'user' | 'timeout'
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_approval_audits_conversation
  ON tool_approval_audits(conversation_id, created_at DESC);
