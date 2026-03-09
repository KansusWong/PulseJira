-- Migration 019: Make signal source platforms extensible.
--
-- Removes the hardcoded platform CHECK constraint so new adapters/platforms
-- can be introduced without DB schema edits, and adds a config JSON field
-- for future platform-specific options.

ALTER TABLE signal_sources
  DROP CONSTRAINT IF EXISTS signal_sources_platform_check;

ALTER TABLE signal_sources
  ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_signal_sources_platform
  ON signal_sources (platform);

