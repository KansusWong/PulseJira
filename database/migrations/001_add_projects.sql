-- Migration 001: Add projects table for multi-project support
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text CHECK (status IN ('draft', 'analyzing', 'planned', 'active', 'archived')) DEFAULT 'draft',
  signal_id uuid REFERENCES signals(id),
  prepare_result jsonb,
  plan_result jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);
