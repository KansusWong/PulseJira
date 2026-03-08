-- 027_team_coordinator_enhancements.sql
-- Sprint 11: Team Coordinator enhancements
--
-- Agent status is stored in agent_teams.config JSONB (agent_statuses field).
-- No new columns needed — this migration only adds indexes for performance.

-- 1. Index on mailbox created_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_mailbox_created_at ON agent_mailbox(team_id, created_at);

-- 2. Index on team_tasks for dependency / status queries
CREATE INDEX IF NOT EXISTS idx_team_tasks_blocked ON team_tasks(team_id, status);
