-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Table for storing the core vision/manifesto chunks (e.g., from vision.md)
create table if not exists vision_knowledge (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(256), -- Using GLM embedding-2 (returns 256 dims in this environment)
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Table for storing raw signals (fetched from URLs, RSS, etc.)
create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  source_url text,
  content text not null,
  summary text,
  embedding vector(256),
  received_at timestamp with time zone default timezone('utc'::text, now()),
  processed boolean default false,
  status text check (status in ('DRAFT', 'PROCESSING', 'ANALYZED', 'APPROVED', 'REJECTED')) default 'DRAFT',
  refined_content text -- Stores user-refined content after initial analysis
);

-- Table for storing historical decisions (Agent outputs)
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id),
  input_context text, -- The context provided to the AI
  decision_rationale text, -- Why this decision was made
  result_action jsonb, -- The structured output (e.g., tasks created)
  embedding vector(256), -- Vector representation of the context/decision for similarity search
  created_at timestamp with time zone default timezone('utc'::text, now()),
  rejection_reason text -- If rejected by human, store here for negative feedback loop
);

-- Index for fast similarity search
create index on vision_knowledge using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create index on decisions using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Indexes for common query patterns (#17)
create index if not exists idx_signals_status on signals (status);
create index if not exists idx_decisions_signal_id on decisions (signal_id);
create index if not exists idx_tasks_status on tasks (status);
create index if not exists idx_tasks_decision_id on tasks (decision_id);

-- RPC function to match vision knowledge
create or replace function match_vision_knowledge (
  query_embedding vector(256),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    vision_knowledge.id,
    vision_knowledge.content,
    1 - (vision_knowledge.embedding <=> query_embedding) as similarity
  from vision_knowledge
  where 1 - (vision_knowledge.embedding <=> query_embedding) > match_threshold
  order by vision_knowledge.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RPC function to match past decisions
create or replace function match_decisions (
  query_embedding vector(256),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  decision_rationale text,
  result_action jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    decisions.id,
    decisions.decision_rationale,
    decisions.result_action,
    1 - (decisions.embedding <=> query_embedding) as similarity
  from decisions
  where 1 - (decisions.embedding <=> query_embedding) > match_threshold
  order by decisions.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Table for subscriptions (RSS, websites, etc.)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  type text check (type in ('rss', 'web', 'github')),
  interval_minutes int default 60,
  last_scraped_at timestamp with time zone,
  active boolean default true
);

-- Tasks table for the DAG and Workflow
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references decisions(id),
  title text not null,
  description text,
  status text check (status in ('inbox', 'triage', 'backlog', 'in_progress', 'done', 'rejected')) default 'inbox',
  priority text,
  affected_files text[],
  dependencies uuid[], -- Array of task IDs this task depends on
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Rejection Logs for Negative Feedback Loop
create table if not exists rejection_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id),
  reason text,
  rejected_at timestamp with time zone default timezone('utc'::text, now())
);

-- ============================================================================
-- Chat-First Architecture Tables (Migration 021)
-- ============================================================================

-- Conversations
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  status text check (status in ('active', 'archived', 'converted')) default 'active',
  project_id uuid references projects(id),
  complexity_assessment jsonb,
  execution_mode text check (execution_mode in ('single_agent', 'workflow', 'agent_team', 'agent_swarm')),
  highlighted boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text check (role in ('user', 'assistant', 'system', 'agent', 'plan')) not null,
  content text not null,
  metadata jsonb,
  created_at timestamp with time zone default now()
);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

-- Agent Teams
create table if not exists agent_teams (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  project_id uuid references projects(id),
  team_name text not null,
  lead_agent text not null,
  status text check (status in ('forming', 'active', 'idle', 'disbanded')) default 'forming',
  config jsonb,
  created_at timestamp with time zone default now()
);

-- Agent Mailbox
create table if not exists agent_mailbox (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references agent_teams(id) on delete cascade,
  from_agent text not null,
  to_agent text not null,
  message_type text check (message_type in (
    'task_assignment', 'message', 'broadcast',
    'plan_approval_request', 'plan_approval_response',
    'idle_notification', 'shutdown_request', 'shutdown_response'
  )),
  payload jsonb not null,
  read boolean default false,
  created_at timestamp with time zone default now()
);
create index if not exists idx_mailbox_recipient on agent_mailbox(to_agent, team_id, read);

-- Team Tasks
create table if not exists team_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references agent_teams(id) on delete cascade,
  subject text not null,
  description text,
  owner text,
  status text check (status in ('pending', 'in_progress', 'completed', 'deleted')) default 'pending',
  blocks uuid[],
  blocked_by uuid[],
  result jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- System Config
create table if not exists system_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone default now()
);
