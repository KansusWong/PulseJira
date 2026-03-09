-- Sprint 13: Add agent_execution_mode to user_preferences
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS agent_execution_mode text
  NOT NULL DEFAULT 'simple'
  CHECK (agent_execution_mode IN ('simple', 'medium', 'advanced'));
