-- 045: Create mate_working_memory table
-- Short-term, mission-scoped working memory for mates during execution.
-- Only used for Mission mode (large projects). Small tasks skip this.
-- Cleaned up when mission enters 'archival' phase (essentials promoted to vault).

create table if not exists mate_working_memory (
  id uuid primary key default gen_random_uuid(),
  mate_id uuid not null references mate_definitions(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (mate_id, mission_id, key)
);

create index if not exists idx_mate_working_memory_mate on mate_working_memory(mate_id);
create index if not exists idx_mate_working_memory_mission on mate_working_memory(mission_id);
