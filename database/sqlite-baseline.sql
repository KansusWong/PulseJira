-- ============================================================================
-- SQLite BASELINE SCHEMA
--
-- Translated from database/migrations/000_baseline.sql (PostgreSQL)
-- for local/single-machine zero-config deployment.
--
-- Key differences from PostgreSQL version:
--   - uuid → TEXT (application-layer UUID generation)
--   - timestamptz → TEXT (ISO 8601 strings, datetime('now'))
--   - jsonb → TEXT (JSON strings)
--   - text[] / uuid[] → TEXT (JSON array strings)
--   - vector(256) → BLOB or TEXT (application-layer cosine similarity)
--   - bigint GENERATED ALWAYS AS IDENTITY → INTEGER PRIMARY KEY AUTOINCREMENT
--   - GIN/ivfflat indexes → omitted (full scan is fine locally)
--   - DO $$ BEGIN ... END $$; blocks → omitted (no procedural SQL)
--   - CREATE EXTENSION vector → omitted
--   - RPC functions → implemented in sqlite-rpc.ts
--   - Foreign keys across prerequisite tables are relaxed (no signals/decisions/tasks/subscriptions prerequisite)
--
-- PREREQUISITES: None. All tables are self-contained for SQLite.
-- ============================================================================

-- Enable WAL mode and foreign keys (also set in sqlite-client.ts PRAGMAs)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ############################################################################
-- SECTION 0: Prerequisite tables (signals, decisions, tasks, subscriptions)
-- In PostgreSQL these exist outside the migration system.
-- For SQLite standalone we create them here.
-- ############################################################################

CREATE TABLE IF NOT EXISTS signals (
  id           TEXT PRIMARY KEY,
  title        TEXT,
  content      TEXT,
  status       TEXT DEFAULT 'DRAFT'
               CHECK (status IN ('DRAFT','PROCESSING','ANALYZED','APPROVED','REJECTED')),
  source_id    TEXT,
  external_id  TEXT,
  external_url TEXT,
  content_hash TEXT,
  platform     TEXT,
  metadata     TEXT DEFAULT '{}',
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signals_content_hash ON signals (content_hash);
CREATE INDEX IF NOT EXISTS idx_signals_external_id  ON signals (external_id);
CREATE INDEX IF NOT EXISTS idx_signals_status       ON signals (status);

CREATE TABLE IF NOT EXISTS decisions (
  id                  TEXT PRIMARY KEY,
  signal_id           TEXT REFERENCES signals(id),
  decision_rationale  TEXT,
  result_action       TEXT DEFAULT '{}',
  embedding           BLOB,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decisions_signal_id ON decisions (signal_id);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  description TEXT,
  status      TEXT DEFAULT 'pending',
  decision_id TEXT REFERENCES decisions(id),
  project_id  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_decision_id ON tasks (decision_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  TEXT PRIMARY KEY,
  name                TEXT,
  config              TEXT DEFAULT '{}',
  system_enabled      INTEGER DEFAULT 1,
  max_items_per_fetch INTEGER DEFAULT 5,
  fetch_interval_hours INTEGER DEFAULT 5,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- ############################################################################
-- SECTION 1: Core Tables
-- ############################################################################

CREATE TABLE IF NOT EXISTS projects (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  description             TEXT NOT NULL DEFAULT '',
  status                  TEXT DEFAULT 'draft'
                          CHECK (status IN (
                            'draft','analyzing','planned','implementing',
                            'implemented','deploying','deployed','active','archived'
                          )),
  signal_id               TEXT REFERENCES signals(id),
  prepare_result          TEXT,
  plan_result             TEXT,
  implement_result        TEXT,
  implementation_plan     TEXT,
  workspace_id            TEXT,
  pr_url                  TEXT,
  deployment_url          TEXT,
  deployment_status       TEXT,
  deployed_at             TEXT,
  is_light                INTEGER DEFAULT 0,
  agent_logs              TEXT,
  pipeline_checkpoint     TEXT,
  org_id                  TEXT,
  created_by              TEXT,
  implementation_plan_id  TEXT,
  deployment_id           TEXT,
  conversation_id         TEXT,
  execution_mode          TEXT CHECK (execution_mode IN ('foreman', 'team')),
  created_at              TEXT DEFAULT (datetime('now')),
  updated_at              TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_org        ON projects (org_id);

-- agent_runs
CREATE TABLE IF NOT EXISTS agent_runs (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  agent_name   TEXT NOT NULL,
  stage        TEXT NOT NULL
               CHECK (stage IN ('prepare','plan','implement','deploy')),
  status       TEXT DEFAULT 'running'
               CHECK (status IN ('running','completed','failed')),
  input        TEXT,
  output       TEXT,
  started_at   TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status  ON agent_runs (status);

-- ############################################################################
-- SECTION 2: Signal Collection
-- ############################################################################

CREATE TABLE IF NOT EXISTS signal_sources (
  id               TEXT PRIMARY KEY,
  platform         TEXT NOT NULL,
  identifier       TEXT NOT NULL,
  label            TEXT NOT NULL,
  keywords         TEXT DEFAULT '[]',
  interval_minutes INTEGER DEFAULT 60,
  active           INTEGER DEFAULT 1,
  last_fetched_at  TEXT,
  config           TEXT DEFAULT '{}',
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now')),
  UNIQUE(platform, identifier)
);

CREATE INDEX IF NOT EXISTS idx_signal_sources_active   ON signal_sources (active);
CREATE INDEX IF NOT EXISTS idx_signal_sources_platform ON signal_sources (platform);

-- ############################################################################
-- SECTION 3: Agent Templates & Instances
-- ############################################################################

CREATE TABLE IF NOT EXISTS agent_templates (
  id                TEXT PRIMARY KEY,
  template_id       TEXT UNIQUE NOT NULL,
  display_name      TEXT NOT NULL,
  role              TEXT NOT NULL,
  description       TEXT NOT NULL,
  run_mode          TEXT NOT NULL
                    CHECK (run_mode IN ('react','single-shot')),
  default_model     TEXT,
  default_max_loops INTEGER DEFAULT 10,
  default_tools     TEXT DEFAULT '[]',
  default_skills    TEXT DEFAULT '[]',
  prompt_template   TEXT NOT NULL,
  category          TEXT CHECK (category IN (
                      'evaluation','planning','implementation','review','meta'
                    )),
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_instances (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  template_id   TEXT REFERENCES agent_templates(template_id),
  name          TEXT NOT NULL,
  custom_prompt TEXT,
  custom_tools  TEXT DEFAULT '[]',
  custom_skills TEXT DEFAULT '[]',
  status        TEXT DEFAULT 'created'
                CHECK (status IN ('created','running','completed','failed')),
  output        TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_instances_project ON agent_instances (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_instances_status  ON agent_instances (status);

-- ############################################################################
-- SECTION 4: Implementation & Code Artifacts
-- ############################################################################

CREATE TABLE IF NOT EXISTS implementation_plans (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id       TEXT,
  dag                TEXT NOT NULL,
  summary            TEXT,
  architecture_notes TEXT,
  status             TEXT DEFAULT 'planning'
                     CHECK (status IN ('planning','executing','completed','failed')),
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_impl_plans_project ON implementation_plans (project_id);

CREATE TABLE IF NOT EXISTS implementation_tasks (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT REFERENCES implementation_plans(id) ON DELETE CASCADE,
  agent_template  TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  depends_on      TEXT DEFAULT '[]',
  tools           TEXT DEFAULT '[]',
  skills          TEXT DEFAULT '[]',
  specialization  TEXT,
  estimated_files TEXT DEFAULT '[]',
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed')),
  output          TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_impl_tasks_plan   ON implementation_tasks (plan_id);
CREATE INDEX IF NOT EXISTS idx_impl_tasks_status ON implementation_tasks (status);

CREATE TABLE IF NOT EXISTS code_artifacts (
  id         TEXT PRIMARY KEY,
  task_id    TEXT REFERENCES implementation_tasks(id) ON DELETE CASCADE,
  type       TEXT NOT NULL
             CHECK (type IN ('file_created','file_modified','pr_created','test_result','command_output')),
  file_path  TEXT,
  content    TEXT,
  pr_url     TEXT,
  metadata   TEXT DEFAULT '{}',
  embedding  BLOB,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_code_artifacts_task ON code_artifacts (task_id);

-- ############################################################################
-- SECTION 5: Workspaces & Deployments
-- ############################################################################

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  repo_url    TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  base_branch TEXT NOT NULL DEFAULT 'main',
  local_path  TEXT NOT NULL,
  status      TEXT DEFAULT 'initializing'
              CHECK (status IN ('initializing','ready','executing','completed','failed','cleaned')),
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspaces_project ON workspaces (project_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_status  ON workspaces (status);

CREATE TABLE IF NOT EXISTS deployments (
  id             TEXT PRIMARY KEY,
  project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
  pr_number      INTEGER NOT NULL,
  pr_url         TEXT NOT NULL,
  merged_at      TEXT,
  target         TEXT NOT NULL DEFAULT 'vercel'
                 CHECK (target IN ('vercel','github-pages','custom')),
  deployment_id  TEXT,
  deployment_url TEXT,
  inspector_url  TEXT,
  state          TEXT DEFAULT 'pending'
                 CHECK (state IN (
                   'pending','merging','deploying','verifying','success','failed','rolled_back'
                 )),
  health_check   TEXT,
  error          TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments (project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_state   ON deployments (state);

-- ############################################################################
-- SECTION 6: Agentic RAG (code patterns & skill embeddings)
-- ############################################################################

CREATE TABLE IF NOT EXISTS code_patterns (
  id           TEXT PRIMARY KEY,
  project_id   TEXT,
  task_id      TEXT,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  pattern_type TEXT NOT NULL DEFAULT 'other'
               CHECK (pattern_type IN (
                 'file_structure','architecture','api_pattern','component',
                 'test_pattern','error_handling','data_model','other'
               )),
  content      TEXT NOT NULL,
  language     TEXT,
  tags         TEXT DEFAULT '[]',
  embedding    BLOB,
  usage_count  INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_embeddings (
  id          TEXT PRIMARY KEY,
  skill_id    TEXT UNIQUE NOT NULL,
  skill_name  TEXT NOT NULL,
  description TEXT NOT NULL,
  tags        TEXT DEFAULT '[]',
  source      TEXT DEFAULT 'local'
              CHECK (source IN ('local','remote')),
  embedding   BLOB,
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ############################################################################
-- SECTION 7: User Preferences
-- ############################################################################

CREATE TABLE IF NOT EXISTS user_preferences (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  org_id      TEXT NOT NULL,
  preferences TEXT DEFAULT '{}',
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, org_id)
);

-- ############################################################################
-- SECTION 8: LLM Usage & Failover
-- ############################################################################

CREATE TABLE IF NOT EXISTS llm_usage (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  agent_name        TEXT NOT NULL,
  model             TEXT,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  account_id        TEXT,
  account_name      TEXT,
  signal_id         TEXT REFERENCES signals(id) ON DELETE SET NULL,
  trace_id          TEXT,
  cost_usd          REAL,
  duration_ms       INTEGER,
  org_id            TEXT,
  user_id           TEXT,
  used_at           TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_project_used_at ON llm_usage (project_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_used_at         ON llm_usage (used_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_account_id      ON llm_usage (account_id, used_at DESC);

CREATE TABLE IF NOT EXISTS llm_failover_events (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  agent_name        TEXT,
  model             TEXT,
  event_type        TEXT NOT NULL CHECK (event_type IN ('switch','exhausted')),
  from_account_id   TEXT,
  from_account_name TEXT,
  to_account_id     TEXT,
  to_account_name   TEXT,
  reason            TEXT,
  error_status      INTEGER,
  error_code        TEXT,
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_failover_events_project_created ON llm_failover_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_failover_events_event_created   ON llm_failover_events (event_type, created_at DESC);

-- ############################################################################
-- SECTION 9: Blackboard (inter-agent shared state)
-- ############################################################################

CREATE TABLE IF NOT EXISTS blackboard_entries (
  id           TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN (
                 'decision','artifact','question','status',
                 'constraint','context','feedback'
               )),
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  author       TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  tags         TEXT DEFAULT '[]',
  supersedes   TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX  IF NOT EXISTS idx_bb_execution       ON blackboard_entries (execution_id);
CREATE INDEX  IF NOT EXISTS idx_bb_project         ON blackboard_entries (project_id);
CREATE INDEX  IF NOT EXISTS idx_bb_exec_key        ON blackboard_entries (execution_id, key);
CREATE INDEX  IF NOT EXISTS idx_bb_exec_type       ON blackboard_entries (execution_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bb_exec_key_version ON blackboard_entries (execution_id, key, version);
CREATE INDEX  IF NOT EXISTS idx_bb_updated_at      ON blackboard_entries (updated_at);

-- ############################################################################
-- SECTION 10: Chat-First Architecture
-- ############################################################################

CREATE TABLE IF NOT EXISTS conversations (
  id                        TEXT PRIMARY KEY,
  title                     TEXT,
  status                    TEXT DEFAULT 'active'
                            CHECK (status IN ('active','archived','converted')),
  project_id                TEXT,
  complexity_assessment      TEXT,
  execution_mode            TEXT CHECK (execution_mode IN (
                              'direct','single_agent','agent_team','workflow','agent_swarm'
                            )),
  clarification_round       INTEGER DEFAULT 0,
  clarification_context     TEXT,
  dm_decision               TEXT,
  dm_approval_status        TEXT CHECK (dm_approval_status IN ('pending','approved','rejected'))
                            DEFAULT NULL,
  structured_requirements   TEXT,
  pending_tool_approval     TEXT,
  architect_phase_status    TEXT CHECK (architect_phase_status IN ('running','completed','failed','timed_out'))
                            DEFAULT NULL,
  architect_checkpoint      TEXT,
  architect_result          TEXT,
  assessed_at_message_count INTEGER DEFAULT 0,
  org_id                    TEXT,
  created_by                TEXT,
  created_at                TEXT DEFAULT (datetime('now')),
  updated_at                TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_org        ON conversations(org_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL
                  CHECK (role IN ('user','assistant','system','agent','plan')),
  content         TEXT NOT NULL,
  metadata        TEXT,
  user_id         TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS agent_teams (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  project_id      TEXT,
  team_name       TEXT NOT NULL,
  lead_agent      TEXT NOT NULL,
  status          TEXT DEFAULT 'forming'
                  CHECK (status IN ('forming','active','idle','disbanded')),
  config          TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_mailbox (
  id           TEXT PRIMARY KEY,
  team_id      TEXT REFERENCES agent_teams(id) ON DELETE CASCADE,
  from_agent   TEXT NOT NULL,
  to_agent     TEXT NOT NULL,
  message_type TEXT CHECK (message_type IN (
                 'task_assignment','message','broadcast',
                 'plan_approval_request','plan_approval_response',
                 'idle_notification','shutdown_request','shutdown_response'
               )),
  payload      TEXT NOT NULL,
  read         INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mailbox_recipient  ON agent_mailbox(to_agent, team_id, read);
CREATE INDEX IF NOT EXISTS idx_mailbox_created_at ON agent_mailbox(team_id, created_at);

CREATE TABLE IF NOT EXISTS team_tasks (
  id          TEXT PRIMARY KEY,
  team_id     TEXT REFERENCES agent_teams(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  description TEXT,
  owner       TEXT,
  status      TEXT DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','completed','deleted')),
  blocks      TEXT DEFAULT '[]',
  blocked_by  TEXT DEFAULT '[]',
  result      TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_tasks_blocked ON team_tasks(team_id, status);

CREATE TABLE IF NOT EXISTS system_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO system_config (key, value) VALUES
  ('signal_collection_enabled', '"true"'),
  ('signal_fetch_interval_hours', '5'),
  ('signal_max_per_platform', '5');

-- ############################################################################
-- SECTION 11: Auth & RBAC
-- ############################################################################

CREATE TABLE IF NOT EXISTS api_keys (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  key_hash           TEXT NOT NULL UNIQUE,
  key_prefix         TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('admin','developer','viewer')),
  is_active          INTEGER NOT NULL DEFAULT 1,
  expires_at         TEXT,
  last_used_at       TEXT,
  scoped_project_ids TEXT DEFAULT '[]',
  metadata           TEXT DEFAULT '{}',
  org_id             TEXT,
  user_id            TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (is_active);

CREATE TABLE IF NOT EXISTS audit_log (
  id                   TEXT PRIMARY KEY,
  api_key_id           TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  method               TEXT NOT NULL,
  path                 TEXT NOT NULL,
  status_code          INTEGER,
  ip_address           TEXT,
  user_agent           TEXT,
  request_body_summary TEXT,
  org_id               TEXT,
  created_at           TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_path       ON audit_log (path);
CREATE INDEX IF NOT EXISTS idx_audit_log_key_id     ON audit_log (api_key_id);

-- ############################################################################
-- SECTION 12: Execution Traces
-- ############################################################################

CREATE TABLE IF NOT EXISTS execution_traces (
  trace_id     TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL CHECK (stage IN ('prepare','plan','implement','deploy','meta')),
  status       TEXT NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','completed','failed')),
  started_at   TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  summary      TEXT
);

CREATE INDEX IF NOT EXISTS idx_exec_traces_project ON execution_traces (project_id, started_at DESC);

CREATE TABLE IF NOT EXISTS execution_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id   TEXT NOT NULL REFERENCES execution_traces(trace_id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  agent_name TEXT,
  payload    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exec_events_trace_seq ON execution_events (trace_id, seq);

-- ############################################################################
-- SECTION 13: Tool Approval Audits
-- ############################################################################

CREATE TABLE IF NOT EXISTS tool_approval_audits (
  id               TEXT PRIMARY KEY,
  approval_id      TEXT UNIQUE NOT NULL,
  conversation_id  TEXT,
  agent_name       TEXT NOT NULL,
  tool_name        TEXT NOT NULL,
  tool_args        TEXT,
  status           TEXT NOT NULL CHECK (status IN ('requested','approved','rejected','timed_out')),
  requested_at     TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at       TEXT,
  decided_by       TEXT,
  rejection_reason TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tool_approval_audits_conversation
  ON tool_approval_audits(conversation_id, created_at DESC);

-- ############################################################################
-- SECTION 14: Webhooks
-- ############################################################################

CREATE TABLE IF NOT EXISTS webhook_configs (
  id               TEXT PRIMARY KEY,
  provider         TEXT NOT NULL CHECK (provider IN ('feishu','dingtalk','slack','wecom','custom')),
  label            TEXT NOT NULL DEFAULT '',
  webhook_url      TEXT NOT NULL,
  events           TEXT NOT NULL DEFAULT '["pipeline_complete","deploy_complete","deploy_failed"]',
  active           INTEGER NOT NULL DEFAULT 1,
  message_template TEXT DEFAULT NULL,
  display_name     TEXT DEFAULT NULL,
  org_id           TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_active ON webhook_configs(active);

-- ############################################################################
-- SECTION 15: Memory & Todo Persistence
-- ############################################################################

CREATE TABLE IF NOT EXISTS memory_entries (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  content      TEXT NOT NULL,
  tags         TEXT DEFAULT '[]',
  category     TEXT NOT NULL DEFAULT 'fact'
               CHECK (category IN ('fact','procedure','context')),
  importance   INTEGER NOT NULL DEFAULT 5
               CHECK (importance BETWEEN 1 AND 10),
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memory_project    ON memory_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_memory_workspace  ON memory_entries (workspace_id);
CREATE INDEX IF NOT EXISTS idx_memory_category   ON memory_entries (category);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_entries (importance DESC);

CREATE TABLE IF NOT EXISTS todo_items (
  id              TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','completed','cancelled')),
  dependencies    TEXT DEFAULT '[]',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_todo_conversation ON todo_items (conversation_id);
CREATE INDEX IF NOT EXISTS idx_todo_project      ON todo_items (project_id);
CREATE INDEX IF NOT EXISTS idx_todo_status       ON todo_items (status);

-- ############################################################################
-- SECTION 16.5: Vision Knowledge
-- ############################################################################

CREATE TABLE IF NOT EXISTS vision_knowledge (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  embedding  BLOB,
  metadata   TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ############################################################################
-- SECTION 16.6: Automation Pipelines
-- ############################################################################

CREATE TABLE IF NOT EXISTS automation_pipelines (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  agent_id         TEXT NOT NULL,
  trigger_type     TEXT NOT NULL CHECK (trigger_type IN ('cron', 'webhook')),
  trigger_config   TEXT NOT NULL DEFAULT '{}',
  task_design      TEXT NOT NULL,
  variables_schema TEXT DEFAULT '{}',
  variables        TEXT DEFAULT '{}',
  execution_config TEXT DEFAULT '{"max_iterations": 30, "timeout_minutes": 60}',
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automation_pipelines_agent_id ON automation_pipelines(agent_id);
CREATE INDEX IF NOT EXISTS idx_automation_pipelines_status   ON automation_pipelines(status);

CREATE TABLE IF NOT EXISTS automation_runs (
  id              TEXT PRIMARY KEY,
  pipeline_id     TEXT REFERENCES automation_pipelines(id) ON DELETE CASCADE,
  trigger_type    TEXT NOT NULL,
  trigger_payload TEXT DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result          TEXT DEFAULT '{}',
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_pipeline_id ON automation_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status      ON automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_created_at  ON automation_runs(created_at DESC);

-- ############################################################################
-- SECTION 18: Vault Artifacts & Asset Marketplace
-- ############################################################################

CREATE TABLE IF NOT EXISTS vault_artifacts (
  id                TEXT PRIMARY KEY,
  project_id        TEXT,
  artifact_type     TEXT NOT NULL
                    CHECK (artifact_type IN ('skill', 'tool', 'doc', 'pptx', 'code')),
  path              TEXT NOT NULL DEFAULT '',
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  created_by_epic   TEXT NOT NULL DEFAULT '',
  created_by_agent  TEXT NOT NULL DEFAULT 'rebuild',
  reuse_count       INTEGER NOT NULL DEFAULT 0,
  tags              TEXT DEFAULT '[]',
  depends_on        TEXT DEFAULT '[]',
  version           INTEGER NOT NULL DEFAULT 1,
  created_by_mate   TEXT,
  mission_id        TEXT,
  org_id            TEXT NOT NULL,
  visibility        TEXT DEFAULT 'org' CHECK (visibility IN ('private','org','public')),
  version_label     TEXT,
  status            TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','deprecated','superseded')),
  payload           TEXT,
  created_by        TEXT,
  published_by      TEXT,
  published_at      TEXT,
  superseded_by     TEXT,
  embedding         BLOB,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vault_project            ON vault_artifacts (project_id);
CREATE INDEX IF NOT EXISTS idx_vault_type               ON vault_artifacts (artifact_type);
CREATE INDEX IF NOT EXISTS idx_vault_epic               ON vault_artifacts (created_by_epic);
CREATE INDEX IF NOT EXISTS idx_vault_reuse              ON vault_artifacts (reuse_count DESC);
CREATE INDEX IF NOT EXISTS idx_vault_artifacts_org      ON vault_artifacts(org_id);
CREATE INDEX IF NOT EXISTS vault_artifacts_org_status_idx  ON vault_artifacts(org_id, status);
CREATE INDEX IF NOT EXISTS vault_artifacts_org_type_idx    ON vault_artifacts(org_id, artifact_type);

-- ############################################################################
-- SECTION 19: Multi-Tenant Identity & Auth
-- ############################################################################

CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  plan       TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','standard','enterprise')),
  settings   TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  password_hash TEXT,
  avatar_url    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS org_members (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON org_members(org_id);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token        TEXT,
  refresh_token       TEXT,
  expires_at          TEXT,
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_accounts_user ON auth_accounts(user_id);

CREATE TABLE IF NOT EXISTS org_invitations (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  invited_by  TEXT NOT NULL REFERENCES users(id),
  token       TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  accepted_at TEXT
);

-- ############################################################################
-- SECTION 20: Platform Secrets & Quotas
-- ############################################################################

CREATE TABLE IF NOT EXISTS platform_secrets (
  id              TEXT PRIMARY KEY,
  org_id          TEXT REFERENCES organizations(id),
  key_name        TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  key_version     INTEGER NOT NULL DEFAULT 1,
  provider        TEXT NOT NULL,
  is_active       INTEGER DEFAULT 1,
  priority        INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id, key_name)
);

CREATE INDEX IF NOT EXISTS idx_platform_secrets_provider ON platform_secrets(provider, is_active);

CREATE TABLE IF NOT EXISTS org_quotas (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period      TEXT NOT NULL DEFAULT 'monthly',
  token_limit INTEGER NOT NULL,
  token_used  INTEGER NOT NULL DEFAULT 0,
  reset_at    TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id)
);

-- ############################################################################
-- SECTION 20.5: MateRegistry (Unified Agent Registration)
-- ############################################################################

CREATE TABLE IF NOT EXISTS mate_definitions (
  id            TEXT PRIMARY KEY,
  org_id        TEXT,
  name          TEXT NOT NULL,
  display_name  TEXT,
  description   TEXT NOT NULL DEFAULT '',
  domains       TEXT NOT NULL DEFAULT '[]',
  tools_allow   TEXT NOT NULL DEFAULT '[]',
  tools_deny    TEXT NOT NULL DEFAULT '[]',
  model         TEXT NOT NULL DEFAULT 'inherit',
  system_prompt TEXT NOT NULL DEFAULT '',
  can_lead      INTEGER NOT NULL DEFAULT 0,
  status        TEXT CHECK (status IN ('idle','active','hibernated','retired')) NOT NULL DEFAULT 'idle',
  source        TEXT CHECK (source IN ('file','db','dynamic')) NOT NULL DEFAULT 'file',
  file_path     TEXT,
  metadata      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mate_definitions_name   ON mate_definitions(name);
CREATE INDEX IF NOT EXISTS idx_mate_definitions_status ON mate_definitions(status);
CREATE INDEX IF NOT EXISTS idx_mate_definitions_org    ON mate_definitions(org_id);

CREATE TABLE IF NOT EXISTS missions (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
  source_chat     TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  mission_name    TEXT NOT NULL,
  lead_mate       TEXT,
  team_mates      TEXT NOT NULL DEFAULT '[]',
  status          TEXT CHECK (status IN (
    'inception','formation','planning','execution',
    'review','delivery','archival','cancelled'
  )) NOT NULL DEFAULT 'inception',
  token_budget    INTEGER,
  tokens_used     INTEGER NOT NULL DEFAULT 0,
  config          TEXT NOT NULL DEFAULT '{}',
  blackboard      TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_missions_status       ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_conversation ON missions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_missions_project      ON missions(project_id);
CREATE INDEX IF NOT EXISTS idx_missions_lead_mate    ON missions(lead_mate);
CREATE INDEX IF NOT EXISTS idx_missions_org          ON missions(org_id);

CREATE TABLE IF NOT EXISTS mate_working_memory (
  id         TEXT PRIMARY KEY,
  mate_id    TEXT NOT NULL REFERENCES mate_definitions(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (mate_id, mission_id, key)
);

CREATE INDEX IF NOT EXISTS idx_mate_working_memory_mate    ON mate_working_memory(mate_id);
CREATE INDEX IF NOT EXISTS idx_mate_working_memory_mission ON mate_working_memory(mission_id);

-- ############################################################################
-- SECTION 23: System Org & Default Data
-- ############################################################################

INSERT OR IGNORE INTO organizations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'System', 'system', 'enterprise');

INSERT OR IGNORE INTO users (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'system@internal', 'System');

INSERT OR IGNORE INTO org_members (id, org_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');

-- ============================================================================
-- END OF SQLITE BASELINE
-- ============================================================================
