-- Migration 019: Add per-call latency tracking to llm_usage for TIME view
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS duration_ms integer;

-- Optional index for time-based aggregations in recent windows
CREATE INDEX IF NOT EXISTS idx_llm_usage_duration_ms ON llm_usage (duration_ms)
  WHERE duration_ms IS NOT NULL;
