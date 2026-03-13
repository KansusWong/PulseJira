-- ============================================================================
-- BASELINE SCHEMA — consolidated from migrations 001–039
--
-- Generated: 2026-03-13
-- This file captures the final state of all tables, indexes, constraints,
-- and RPC functions. It replaces migrations 001 through 039 for fresh
-- Supabase deployments.
--
-- PREREQUISITES (tables created outside the migration system):
--   • signals   — signal/requirement intake table
--   • decisions — decision records linked to signals
--   • tasks     — kanban task items
--   • subscriptions — platform subscription configs
--
-- These four tables must exist before running this baseline.
-- If migrating an existing database, DO NOT run this file — apply only
-- the incremental migration files that have not yet been executed.
-- ============================================================================

-- ============================================================================
-- EXTENSION: pgvector (required for embedding columns)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ############################################################################
-- SECTION 1: Core Tables
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 1.1  projects
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  description             text NOT NULL DEFAULT '',
  status                  text DEFAULT 'draft'
                          CHECK (status IN (
                            'draft','analyzing','planned','implementing',
                            'implemented','deploying','deployed','active','archived'
                          )),
  signal_id               uuid REFERENCES signals(id),
  prepare_result          jsonb,
  plan_result             jsonb,
  implement_result        jsonb,
  implementation_plan     jsonb,
  -- workspace / deployment links (FKs added after target tables exist)
  workspace_id            uuid,
  pr_url                  text,
  deployment_url          text,
  deployment_status       text,
  deployed_at             timestamptz,
  -- light project & conversation link
  is_light                boolean DEFAULT FALSE,
  -- agent pipeline state
  agent_logs              jsonb,
  pipeline_checkpoint     jsonb,
  created_at              timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at              timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);

-- ----------------------------------------------------------------------------
-- 1.2  agent_runs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  agent_name   text NOT NULL,
  stage        text NOT NULL
               CHECK (stage IN ('prepare','plan','implement','deploy')),
  status       text DEFAULT 'running'
               CHECK (status IN ('running','completed','failed')),
  input        jsonb,
  output       jsonb,
  started_at   timestamptz DEFAULT timezone('utc'::text, now()),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status  ON agent_runs (status);

-- ############################################################################
-- SECTION 2: Signal Collection
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 2.1  signal_sources
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signal_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform         text NOT NULL,          -- no CHECK: extensible
  identifier       text NOT NULL,
  label            text NOT NULL,
  keywords         text[] DEFAULT '{}',
  interval_minutes integer DEFAULT 60,
  active           boolean DEFAULT true,
  last_fetched_at  timestamptz,
  config           jsonb DEFAULT '{}'::jsonb,
  created_at       timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at       timestamptz DEFAULT timezone('utc'::text, now()),
  UNIQUE(platform, identifier)
);

CREATE INDEX IF NOT EXISTS idx_signal_sources_active   ON signal_sources (active);
CREATE INDEX IF NOT EXISTS idx_signal_sources_platform ON signal_sources (platform);

-- ----------------------------------------------------------------------------
-- 2.2  signals — ALTER pre-existing table
-- ----------------------------------------------------------------------------
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source_id     uuid REFERENCES signal_sources(id);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS external_id   text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS external_url  text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS content_hash  text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS platform      text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS metadata      jsonb DEFAULT '{}';

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_status_check;
ALTER TABLE signals ADD CONSTRAINT signals_status_check
  CHECK (status IN ('DRAFT','PROCESSING','ANALYZED','APPROVED','REJECTED'));

CREATE INDEX IF NOT EXISTS idx_signals_content_hash ON signals (content_hash);
CREATE INDEX IF NOT EXISTS idx_signals_external_id  ON signals (external_id);
CREATE INDEX IF NOT EXISTS idx_signals_status       ON signals (status);

-- ----------------------------------------------------------------------------
-- 2.3  decisions — index on pre-existing table
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_decisions_signal_id ON decisions (signal_id);

-- ----------------------------------------------------------------------------
-- 2.4  tasks — ALTER pre-existing table
-- ----------------------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_decision_id ON tasks (decision_id);

-- ############################################################################
-- SECTION 3: Agent Templates & Instances
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 3.1  agent_templates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       text UNIQUE NOT NULL,
  display_name      text NOT NULL,
  role              text NOT NULL,
  description       text NOT NULL,
  run_mode          text NOT NULL
                    CHECK (run_mode IN ('react','single-shot')),
  default_model     text,
  default_max_loops integer DEFAULT 10,
  default_tools     text[] DEFAULT '{}',
  default_skills    text[] DEFAULT '{}',
  prompt_template   text NOT NULL,
  category          text CHECK (category IN (
                      'evaluation','planning','implementation','review','meta'
                    )),
  created_at        timestamptz DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 3.2  agent_instances
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_instances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  template_id   text REFERENCES agent_templates(template_id),
  name          text NOT NULL,
  custom_prompt text,
  custom_tools  text[] DEFAULT '{}',
  custom_skills text[] DEFAULT '{}',
  status        text DEFAULT 'created'
                CHECK (status IN ('created','running','completed','failed')),
  output        jsonb,
  created_at    timestamptz DEFAULT timezone('utc'::text, now()),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_instances_project ON agent_instances (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_instances_status  ON agent_instances (status);

-- ############################################################################
-- SECTION 4: Implementation & Code Artifacts
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 4.1  implementation_plans
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS implementation_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id       uuid,
  dag                jsonb NOT NULL,
  summary            text,
  architecture_notes text,
  status             text DEFAULT 'planning'
                     CHECK (status IN ('planning','executing','completed','failed')),
  created_at         timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at         timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_impl_plans_project ON implementation_plans (project_id);

-- ----------------------------------------------------------------------------
-- 4.2  implementation_tasks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS implementation_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid REFERENCES implementation_plans(id) ON DELETE CASCADE,
  agent_template  text NOT NULL,
  title           text NOT NULL,
  description     text NOT NULL,
  depends_on      text[] DEFAULT '{}',
  tools           text[] DEFAULT '{}',
  skills          text[] DEFAULT '{}',
  specialization  text,
  estimated_files text[] DEFAULT '{}',
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed')),
  output          jsonb,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_impl_tasks_plan   ON implementation_tasks (plan_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_status ON implementation_tasks (status);

-- ----------------------------------------------------------------------------
-- 4.3  code_artifacts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS code_artifacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES implementation_tasks(id) ON DELETE CASCADE,
  type       text NOT NULL
             CHECK (type IN ('file_created','file_modified','pr_created','test_result','command_output')),
  file_path  text,
  content    text,
  pr_url     text,
  metadata   jsonb DEFAULT '{}',
  embedding  vector(256),
  created_at timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_code_artifacts_task      ON code_artifacts (task_id);
CREATE INDEX IF NOT EXISTS idx_code_artifacts_embedding ON code_artifacts
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ############################################################################
-- SECTION 5: Workspaces & Deployments
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 5.1  workspaces
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  repo_url    text NOT NULL,
  branch_name text NOT NULL,
  base_branch text NOT NULL DEFAULT 'main',
  local_path  text NOT NULL,
  status      text DEFAULT 'initializing'
              CHECK (status IN ('initializing','ready','executing','completed','failed','cleaned')),
  created_at  timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at  timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_workspaces_project ON workspaces (project_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_status  ON workspaces (status);

-- ----------------------------------------------------------------------------
-- 5.2  deployments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deployments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid REFERENCES projects(id) ON DELETE CASCADE,
  pr_number      integer NOT NULL,
  pr_url         text NOT NULL,
  merged_at      timestamptz,
  target         text NOT NULL DEFAULT 'vercel'
                 CHECK (target IN ('vercel','github-pages','custom')),
  deployment_id  text,
  deployment_url text,
  inspector_url  text,
  state          text DEFAULT 'pending'
                 CHECK (state IN (
                   'pending','merging','deploying','verifying','success','failed','rolled_back'
                 )),
  health_check   jsonb,
  error          text,
  created_at     timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at     timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments (project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_state   ON deployments (state);

-- ############################################################################
-- SECTION 6: Agentic RAG (code patterns & skill embeddings)
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 6.1  code_patterns
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS code_patterns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid,
  task_id      uuid,
  name         text NOT NULL,
  description  text NOT NULL,
  pattern_type text NOT NULL DEFAULT 'other'
               CHECK (pattern_type IN (
                 'file_structure','architecture','api_pattern','component',
                 'test_pattern','error_handling','data_model','other'
               )),
  content      text NOT NULL,
  language     text,
  tags         text[] DEFAULT '{}',
  embedding    vector(256),
  usage_count  integer DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_code_patterns_embedding ON code_patterns
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ----------------------------------------------------------------------------
-- 6.2  skill_embeddings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_embeddings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id    text UNIQUE NOT NULL,
  skill_name  text NOT NULL,
  description text NOT NULL,
  tags        text[] DEFAULT '{}',
  source      text DEFAULT 'local'
              CHECK (source IN ('local','remote')),
  embedding   vector(256),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_embeddings_embedding ON skill_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- ############################################################################
-- SECTION 7: User Preferences
-- ############################################################################

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id              text PRIMARY KEY DEFAULT 'default',
  topics               text[] DEFAULT '{}',
  platforms            jsonb DEFAULT '{"reddit":{"enabled":false,"sources":[]},"twitter":{"enabled":false,"sources":[]},"youtube":{"enabled":false,"sources":[]}}',
  agent_execution_mode text NOT NULL DEFAULT 'simple'
                       CHECK (agent_execution_mode IN ('simple','medium','advanced')),
  trust_level          text NOT NULL DEFAULT 'collaborative'
                       CHECK (trust_level IN ('auto','collaborative')),
  updated_at           timestamptz DEFAULT timezone('utc'::text, now())
);

INSERT INTO user_preferences (user_id) VALUES ('default')
ON CONFLICT (user_id) DO NOTHING;

-- ############################################################################
-- SECTION 8: LLM Usage & Failover
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 8.1  llm_usage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS llm_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  agent_name        text NOT NULL,
  model             text,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens      integer NOT NULL DEFAULT 0,
  account_id        text,
  account_name      text,
  signal_id         uuid REFERENCES signals(id) ON DELETE SET NULL,
  trace_id          text,
  cost_usd          numeric,
  duration_ms       integer,
  used_at           timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_project_used_at ON llm_usage (project_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_used_at         ON llm_usage (used_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_account_id      ON llm_usage (account_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_signal_id       ON llm_usage (signal_id) WHERE signal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_trace_id        ON llm_usage (trace_id)  WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_duration_ms     ON llm_usage (duration_ms) WHERE duration_ms IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 8.2  llm_failover_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS llm_failover_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  agent_name        text,
  model             text,
  event_type        text NOT NULL CHECK (event_type IN ('switch','exhausted')),
  from_account_id   text,
  from_account_name text,
  to_account_id     text,
  to_account_name   text,
  reason            text,
  error_status      integer,
  error_code        text,
  created_at        timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_llm_failover_events_project_created      ON llm_failover_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_failover_events_event_created        ON llm_failover_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_failover_events_from_account_created ON llm_failover_events (from_account_id, created_at DESC);

-- ############################################################################
-- SECTION 9: Blackboard (inter-agent shared state)
-- ############################################################################

CREATE TABLE IF NOT EXISTS blackboard_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN (
                 'decision','artifact','question','status',
                 'constraint','context','feedback'
               )),
  key          text NOT NULL,
  value        jsonb NOT NULL,
  author       text NOT NULL,
  version      integer NOT NULL DEFAULT 1,
  tags         text[] DEFAULT '{}',
  supersedes   uuid,
  created_at   timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at   timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX  IF NOT EXISTS idx_bb_execution       ON blackboard_entries (execution_id);
CREATE INDEX  IF NOT EXISTS idx_bb_project         ON blackboard_entries (project_id);
CREATE INDEX  IF NOT EXISTS idx_bb_exec_key        ON blackboard_entries (execution_id, key);
CREATE INDEX  IF NOT EXISTS idx_bb_exec_type       ON blackboard_entries (execution_id, type);
CREATE INDEX  IF NOT EXISTS idx_bb_tags            ON blackboard_entries USING GIN (tags);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bb_exec_key_version ON blackboard_entries (execution_id, key, version);
CREATE INDEX  IF NOT EXISTS idx_bb_updated_at      ON blackboard_entries (updated_at);

-- ############################################################################
-- SECTION 10: Chat-First Architecture
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 10.1  conversations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                     TEXT,
  status                    TEXT DEFAULT 'active'
                            CHECK (status IN ('active','archived','converted')),
  project_id                UUID,   -- FK added below after projects is confirmed
  complexity_assessment      JSONB,
  execution_mode            TEXT CHECK (execution_mode IN (
                              'direct','single_agent','agent_team','workflow','agent_swarm'
                            )),
  clarification_round       INT DEFAULT 0,
  clarification_context     JSONB,
  dm_decision               JSONB,
  dm_approval_status        TEXT CHECK (dm_approval_status IN ('pending','approved','rejected'))
                            DEFAULT NULL,
  structured_requirements   JSONB,
  pending_tool_approval     JSONB,
  architect_phase_status    TEXT CHECK (architect_phase_status IN ('running','completed','failed','timed_out'))
                            DEFAULT NULL,
  architect_checkpoint      JSONB,
  architect_result          JSONB,
  assessed_at_message_count INT DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);

-- ----------------------------------------------------------------------------
-- 10.2  messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL
                  CHECK (role IN ('user','assistant','system','agent','plan')),
  content         TEXT NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ----------------------------------------------------------------------------
-- 10.3  agent_teams
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  project_id      UUID,   -- FK added below
  team_name       TEXT NOT NULL,
  lead_agent      TEXT NOT NULL,
  status          TEXT DEFAULT 'forming'
                  CHECK (status IN ('forming','active','idle','disbanded')),
  config          JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_teams_status_created
  ON agent_teams(status, created_at) WHERE status = 'disbanded';

-- ----------------------------------------------------------------------------
-- 10.4  agent_mailbox
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_mailbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID REFERENCES agent_teams(id) ON DELETE CASCADE,
  from_agent   TEXT NOT NULL,
  to_agent     TEXT NOT NULL,
  message_type TEXT CHECK (message_type IN (
                 'task_assignment','message','broadcast',
                 'plan_approval_request','plan_approval_response',
                 'idle_notification','shutdown_request','shutdown_response'
               )),
  payload      JSONB NOT NULL,
  read         BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mailbox_recipient  ON agent_mailbox(to_agent, team_id, read);
CREATE INDEX IF NOT EXISTS idx_mailbox_created_at ON agent_mailbox(team_id, created_at);

-- ----------------------------------------------------------------------------
-- 10.5  team_tasks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID REFERENCES agent_teams(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  description TEXT,
  owner       TEXT,
  status      TEXT DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','completed','deleted')),
  blocks      UUID[],
  blocked_by  UUID[],
  result      JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_tasks_blocked ON team_tasks(team_id, status);

-- ----------------------------------------------------------------------------
-- 10.6  system_config
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_config (key, value) VALUES
  ('signal_collection_enabled', '"true"'),
  ('signal_fetch_interval_hours', '5'),
  ('signal_max_per_platform', '5')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 10.7  subscriptions — ALTER pre-existing table
-- ----------------------------------------------------------------------------
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS system_enabled       BOOLEAN DEFAULT TRUE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS max_items_per_fetch  INT DEFAULT 5;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS fetch_interval_hours INT DEFAULT 5;

-- ############################################################################
-- SECTION 11: Auth & RBAC
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 11.1  api_keys
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  key_hash           text NOT NULL,
  key_prefix         text NOT NULL,
  role               text NOT NULL CHECK (role IN ('admin','developer','viewer')),
  is_active          boolean NOT NULL DEFAULT true,
  expires_at         timestamptz,
  last_used_at       timestamptz,
  scoped_project_ids uuid[],
  metadata           jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix          ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active          ON api_keys (is_active);

-- ----------------------------------------------------------------------------
-- 11.2  audit_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id           uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  method               text NOT NULL,
  path                 text NOT NULL,
  status_code          integer,
  ip_address           text,
  user_agent           text,
  request_body_summary text,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_path       ON audit_log (path);
CREATE INDEX IF NOT EXISTS idx_audit_log_key_id     ON audit_log (api_key_id);

-- ############################################################################
-- SECTION 12: Execution Traces
-- ############################################################################

CREATE TABLE IF NOT EXISTS execution_traces (
  trace_id     text PRIMARY KEY,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  stage        text NOT NULL CHECK (stage IN ('prepare','plan','implement','deploy','meta')),
  status       text NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','completed','failed')),
  started_at   timestamptz DEFAULT timezone('utc'::text, now()),
  completed_at timestamptz,
  summary      jsonb
);

CREATE INDEX IF NOT EXISTS idx_exec_traces_project          ON execution_traces (project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_traces_status_completed ON execution_traces (status, completed_at)
  WHERE status IN ('completed','failed');

CREATE TABLE IF NOT EXISTS execution_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trace_id   text NOT NULL REFERENCES execution_traces(trace_id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  event_type text NOT NULL,
  agent_name text,
  payload    jsonb,
  created_at timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_exec_events_trace_seq ON execution_events (trace_id, seq);

-- ############################################################################
-- SECTION 13: Tool Approval Audits
-- ############################################################################

CREATE TABLE IF NOT EXISTS tool_approval_audits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id      text UNIQUE NOT NULL,
  conversation_id  uuid,
  agent_name       text NOT NULL,
  tool_name        text NOT NULL,
  tool_args        jsonb,
  status           text NOT NULL CHECK (status IN ('requested','approved','rejected','timed_out')),
  requested_at     timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz,
  decided_by       text,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_approval_audits_conversation
  ON tool_approval_audits(conversation_id, created_at DESC);

-- ############################################################################
-- SECTION 14: Webhooks
-- ############################################################################

CREATE TABLE IF NOT EXISTS webhook_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT NOT NULL CHECK (provider IN ('feishu','dingtalk','slack','wecom','custom')),
  label            TEXT NOT NULL DEFAULT '',
  webhook_url      TEXT NOT NULL,
  events           TEXT[] NOT NULL DEFAULT '{"pipeline_complete","deploy_complete","deploy_failed"}',
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  message_template TEXT DEFAULT NULL,
  display_name     TEXT DEFAULT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_active ON webhook_configs(active);

-- ############################################################################
-- SECTION 15: Memory & Todo Persistence
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 15.1  memory_entries — cross-session agent memory
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_entries (
  id           text PRIMARY KEY,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  content      text NOT NULL,
  tags         text[] DEFAULT '{}',
  category     text NOT NULL DEFAULT 'fact'
               CHECK (category IN ('fact','procedure','context')),
  importance   integer NOT NULL DEFAULT 5
               CHECK (importance BETWEEN 1 AND 10),
  created_at   timestamptz DEFAULT timezone('utc', now()),
  updated_at   timestamptz DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_memory_project    ON memory_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_memory_workspace  ON memory_entries (workspace_id);
CREATE INDEX IF NOT EXISTS idx_memory_category   ON memory_entries (category);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_entries (importance DESC);
CREATE INDEX IF NOT EXISTS idx_memory_tags       ON memory_entries USING GIN (tags);

-- ----------------------------------------------------------------------------
-- 15.2  todo_items — per-conversation task list
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS todo_items (
  id              text NOT NULL,
  conversation_id text NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  content         text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','completed','cancelled')),
  dependencies    text[] DEFAULT '{}',
  created_at      timestamptz DEFAULT timezone('utc', now()),
  updated_at      timestamptz DEFAULT timezone('utc', now()),
  PRIMARY KEY (conversation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_todo_conversation ON todo_items (conversation_id);
CREATE INDEX IF NOT EXISTS idx_todo_project      ON todo_items (project_id);
CREATE INDEX IF NOT EXISTS idx_todo_status       ON todo_items (status);

-- ############################################################################
-- SECTION 16: Deferred Foreign Keys (circular references)
-- ############################################################################

-- projects → implementation_plans
ALTER TABLE projects ADD COLUMN IF NOT EXISTS implementation_plan_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'projects_implementation_plan_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_implementation_plan_id_fkey
      FOREIGN KEY (implementation_plan_id) REFERENCES implementation_plans(id);
  END IF;
END $$;

-- projects → deployments
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deployment_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'projects_deployment_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_deployment_id_fkey
      FOREIGN KEY (deployment_id) REFERENCES deployments(id);
  END IF;
END $$;

-- projects → conversations (+ unique partial index)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS conversation_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'projects_conversation_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES conversations(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_unique_conversation_id
  ON projects (conversation_id) WHERE conversation_id IS NOT NULL;

-- conversations → projects (ON DELETE SET NULL)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'conversations_project_id_fkey'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- agent_teams → projects (ON DELETE CASCADE)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agent_teams_project_id_fkey'
  ) THEN
    ALTER TABLE agent_teams
      ADD CONSTRAINT agent_teams_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ############################################################################
-- SECTION 16.5: Vision Knowledge & Decisions (core RAG source tables)
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 16.5.1  vision_knowledge — core vision/manifesto chunks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vision_knowledge (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content    text NOT NULL,
  embedding  vector(256),
  metadata   jsonb,
  created_at timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_vision_knowledge_embedding ON vision_knowledge
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ----------------------------------------------------------------------------
-- 16.5.2  decisions — embedding index for semantic search
-- ----------------------------------------------------------------------------
-- (decisions table is a PREREQUISITE, but ensure embedding column + index exist)
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS embedding vector(256);

CREATE INDEX IF NOT EXISTS idx_decisions_embedding ON decisions
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ############################################################################
-- SECTION 16.6: Automation Pipelines
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 16.6.1  automation_pipelines
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_pipelines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  agent_id         TEXT NOT NULL,
  trigger_type     TEXT NOT NULL CHECK (trigger_type IN ('cron', 'webhook')),
  trigger_config   JSONB NOT NULL DEFAULT '{}',
  task_design      TEXT NOT NULL,
  variables_schema JSONB DEFAULT '{}',
  variables        JSONB DEFAULT '{}',
  execution_config JSONB DEFAULT '{"max_iterations": 30, "timeout_minutes": 60}',
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_pipelines_agent_id ON automation_pipelines(agent_id);
CREATE INDEX IF NOT EXISTS idx_automation_pipelines_status   ON automation_pipelines(status);

-- ----------------------------------------------------------------------------
-- 16.6.2  automation_runs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id     UUID REFERENCES automation_pipelines(id) ON DELETE CASCADE,
  trigger_type    TEXT NOT NULL,
  trigger_payload JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result          JSONB DEFAULT '{}',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_pipeline_id ON automation_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status      ON automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_created_at  ON automation_runs(created_at DESC);

-- ############################################################################
-- SECTION 17: RPC Functions (Agentic RAG)
-- ############################################################################

-- ----------------------------------------------------------------------------
-- match_code_patterns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_code_patterns(
  query_embedding vector(256),
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 5,
  filter_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, name text, description text, pattern_type text,
  content text, language text, tags text[], usage_count integer, similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id, cp.name, cp.description, cp.pattern_type,
    cp.content, cp.language, cp.tags, cp.usage_count,
    1 - (cp.embedding <=> query_embedding) AS similarity
  FROM code_patterns cp
  WHERE cp.embedding IS NOT NULL
    AND 1 - (cp.embedding <=> query_embedding) > match_threshold
    AND (filter_project_id IS NULL OR cp.project_id = filter_project_id)
  ORDER BY cp.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- match_skills
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_skills(
  query_embedding vector(256),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid, skill_id text, skill_name text, description text,
  tags text[], source text, similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.id, se.skill_id, se.skill_name, se.description,
    se.tags, se.source,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM skill_embeddings se
  WHERE se.embedding IS NOT NULL
    AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- match_code_artifacts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_code_artifacts(
  query_embedding vector(256),
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid, task_id uuid, type text, file_path text,
  content text, pr_url text, similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'code_artifacts') THEN
    RETURN QUERY EXECUTE
      'SELECT ca.id, ca.task_id, ca.type, ca.file_path, ca.content, ca.pr_url,
              1 - (ca.embedding <=> $1) AS similarity
       FROM code_artifacts ca
       WHERE ca.embedding IS NOT NULL
         AND 1 - (ca.embedding <=> $1) > $2
       ORDER BY ca.embedding <=> $1
       LIMIT $3'
    USING query_embedding, match_threshold, match_count;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- match_vision_knowledge
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_vision_knowledge(
  query_embedding vector(256),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid, content text, similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    vk.id, vk.content,
    1 - (vk.embedding <=> query_embedding) AS similarity
  FROM vision_knowledge vk
  WHERE vk.embedding IS NOT NULL
    AND 1 - (vk.embedding <=> query_embedding) > match_threshold
  ORDER BY vk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- match_decisions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_decisions(
  query_embedding vector(256),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid, decision_rationale text, result_action jsonb, similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id, d.decision_rationale, d.result_action,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM decisions d
  WHERE d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- END OF BASELINE
-- ============================================================================
