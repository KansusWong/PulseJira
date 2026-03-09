-- Migration 022: Add Authentication & RBAC
-- Creates api_keys and audit_log tables for API key authentication and audit trail.

-- API Keys table
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  role text not null check (role in ('admin', 'developer', 'viewer')),
  is_active boolean not null default true,
  expires_at timestamp with time zone,
  last_used_at timestamp with time zone,
  scoped_project_ids uuid[],
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Unique index on key_hash for fast lookup
create unique index if not exists idx_api_keys_key_hash on api_keys (key_hash);

-- Index on key_prefix for listing/display
create index if not exists idx_api_keys_prefix on api_keys (key_prefix);

-- Index on is_active for filtering
create index if not exists idx_api_keys_active on api_keys (is_active);

-- Audit Log table (append-only)
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references api_keys(id) on delete set null,
  method text not null,
  path text not null,
  status_code integer,
  ip_address text,
  user_agent text,
  request_body_summary text,
  created_at timestamp with time zone default now()
);

-- Index for time-range queries on audit log
create index if not exists idx_audit_log_created_at on audit_log (created_at desc);

-- Index for filtering by path
create index if not exists idx_audit_log_path on audit_log (path);

-- Index for filtering by api_key_id
create index if not exists idx_audit_log_key_id on audit_log (api_key_id);
