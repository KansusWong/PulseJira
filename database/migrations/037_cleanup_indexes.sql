-- ============================================================================
-- Migration 037: Add indexes for stale-state cleanup queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations(updated_at);

CREATE INDEX IF NOT EXISTS idx_agent_teams_status_created
  ON agent_teams(status, created_at)
  WHERE status = 'disbanded';

CREATE INDEX IF NOT EXISTS idx_exec_traces_status_completed
  ON execution_traces(status, completed_at)
  WHERE status IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS idx_bb_updated_at
  ON blackboard_entries(updated_at);
