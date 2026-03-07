-- Migration 023: Add DM checkpoint columns to conversations
-- Supports human-in-the-loop approval between Decision Maker and Architect phases.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS dm_decision JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS dm_approval_status TEXT
  CHECK (dm_approval_status IN ('pending', 'approved', 'rejected'))
  DEFAULT NULL;
