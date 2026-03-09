-- ============================================================================
-- Migration 021: Chat-First Architecture
-- Adds conversations, messages, agent_teams, agent_mailbox, team_tasks,
-- system_config tables and subscription controls for the Chat-First redesign.
-- ============================================================================

-- 1. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  status TEXT CHECK (status IN ('active', 'archived', 'converted')) DEFAULT 'active',
  project_id UUID REFERENCES projects(id),
  complexity_assessment JSONB,
  execution_mode TEXT CHECK (execution_mode IN ('single_agent', 'workflow', 'agent_team', 'agent_swarm')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant', 'system', 'agent', 'plan')) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- 3. Agent Teams table
CREATE TABLE IF NOT EXISTS agent_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  project_id UUID REFERENCES projects(id),
  team_name TEXT NOT NULL,
  lead_agent TEXT NOT NULL,
  status TEXT CHECK (status IN ('forming', 'active', 'idle', 'disbanded')) DEFAULT 'forming',
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Agent Mailbox table
CREATE TABLE IF NOT EXISTS agent_mailbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES agent_teams(id) ON DELETE CASCADE,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  message_type TEXT CHECK (message_type IN (
    'task_assignment', 'message', 'broadcast',
    'plan_approval_request', 'plan_approval_response',
    'idle_notification', 'shutdown_request', 'shutdown_response'
  )),
  payload JSONB NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mailbox_recipient ON agent_mailbox(to_agent, team_id, read);

-- 5. Team Tasks table
CREATE TABLE IF NOT EXISTS team_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES agent_teams(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'deleted')) DEFAULT 'pending',
  blocks UUID[],
  blocked_by UUID[],
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. System Config table
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial system config records
INSERT INTO system_config (key, value) VALUES
  ('signal_collection_enabled', '"true"'),
  ('signal_fetch_interval_hours', '5'),
  ('signal_max_per_platform', '5')
ON CONFLICT (key) DO NOTHING;

-- 7. Subscription controls
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS system_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS max_items_per_fetch INT DEFAULT 5;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS fetch_interval_hours INT DEFAULT 5;
