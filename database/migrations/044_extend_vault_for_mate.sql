-- 044: Extend vault_artifacts for mate/mission tracking
-- Adds created_by_mate and mission_id to link artifacts to their creators.
-- Core principle: artifacts always persist, process data per-mission only.

alter table vault_artifacts add column if not exists created_by_mate text;
alter table vault_artifacts add column if not exists mission_id uuid;

create index if not exists idx_vault_artifacts_mate on vault_artifacts(created_by_mate) where created_by_mate is not null;
create index if not exists idx_vault_artifacts_mission on vault_artifacts(mission_id) where mission_id is not null;
