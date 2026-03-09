-- Migration 003: Add project_id foreign key to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (project_id);
