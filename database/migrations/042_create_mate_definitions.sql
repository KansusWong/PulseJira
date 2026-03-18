-- 042: Create mate_definitions table
-- Persistent mate (agent persona) registration for the MateRegistry system.
-- Replaces the ephemeral SubagentRegistry file-only approach.

create table if not exists mate_definitions (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  display_name text,
  description text not null default '',
  domains text[] not null default '{}',
  tools_allow text[] not null default '{}',
  tools_deny text[] not null default '{}',
  model text not null default 'inherit',
  system_prompt text not null default '',
  can_lead boolean not null default false,
  status text check (status in ('idle', 'active', 'hibernated', 'retired')) not null default 'idle',
  source text check (source in ('file', 'db', 'dynamic')) not null default 'file',
  file_path text,
  metadata jsonb not null default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_mate_definitions_name on mate_definitions(name);
create index if not exists idx_mate_definitions_status on mate_definitions(status);
create index if not exists idx_mate_definitions_domains on mate_definitions using gin(domains);
create index if not exists idx_mate_definitions_can_lead on mate_definitions(can_lead) where can_lead = true;
