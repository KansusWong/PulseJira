-- 043: Create missions table
-- Evolves from agent_teams to support the full Mission lifecycle.
-- Missions represent large, multi-mate collaborative projects.

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  source_chat uuid references conversations(id) on delete set null,
  mission_name text not null,
  lead_mate text references mate_definitions(name),
  team_mates text[] not null default '{}',
  status text check (status in (
    'inception', 'formation', 'planning', 'execution',
    'review', 'delivery', 'archival', 'cancelled'
  )) not null default 'inception',
  token_budget integer,
  tokens_used integer not null default 0,
  config jsonb not null default '{}',
  blackboard jsonb not null default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_missions_status on missions(status);
create index if not exists idx_missions_conversation on missions(conversation_id);
create index if not exists idx_missions_project on missions(project_id);
create index if not exists idx_missions_lead_mate on missions(lead_mate);
