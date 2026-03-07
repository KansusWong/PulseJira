-- ============================================================================
-- Migration 022: L1/L2/L3 Complexity Routing
-- Adds clarification tracking to conversations, light project flag, and
-- updates execution_mode constraint to include 'direct'.
-- ============================================================================

-- 1. Conversations: clarification state tracking
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS clarification_round INT DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS clarification_context JSONB;

-- 2. Conversations: update execution_mode constraint to include 'direct'
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_execution_mode_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_execution_mode_check
  CHECK (execution_mode IN ('direct', 'single_agent', 'agent_team', 'workflow', 'agent_swarm'));

-- 3. Projects: light project flag + originating conversation
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_light BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id);
