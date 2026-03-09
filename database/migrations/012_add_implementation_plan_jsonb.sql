-- Migration 012: Add implementation_plan JSONB column to projects
-- Stores the full orchestrator-generated plan (tasks DAG) so re-runs can skip orchestration.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS implementation_plan jsonb;
