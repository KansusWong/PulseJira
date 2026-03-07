-- Migration 024: Add structured_requirements and pending_tool_approval to conversations
-- Supports Task #2 (StructuredRequirements injection) and Task #1 (Architect tool approval)

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS structured_requirements JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pending_tool_approval JSONB;
