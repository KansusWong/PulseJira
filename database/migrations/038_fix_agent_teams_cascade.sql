-- ============================================================================
-- Migration 038: Fix agent_teams & conversations foreign keys to CASCADE on delete
-- Without this, deleting a project fails if agent_teams rows reference it.
-- ============================================================================

-- agent_teams.project_id: add ON DELETE CASCADE
ALTER TABLE agent_teams DROP CONSTRAINT IF EXISTS agent_teams_project_id_fkey;
ALTER TABLE agent_teams
  ADD CONSTRAINT agent_teams_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- conversations.project_id: add ON DELETE SET NULL
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_project_id_fkey;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
