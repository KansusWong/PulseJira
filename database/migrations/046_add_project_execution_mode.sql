-- 046_add_project_execution_mode.sql
-- Adds execution_mode to projects for Chat/Project separation (foreman vs team)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS execution_mode text
  CHECK (execution_mode IN ('foreman', 'team'));

COMMENT ON COLUMN projects.execution_mode IS
  'Execution mode: foreman (single agent) or team (multi-agent collaboration)';
