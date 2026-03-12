-- ============================================================================
-- Migration 036: Add assessed_at_message_count to conversations
-- Tracks the user message count at which complexity was last assessed,
-- enabling reassessment throttling (only re-run assessment after N new
-- user messages rather than on every message).
-- ============================================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assessed_at_message_count INT DEFAULT 0;
