-- Migration 018: Add cost tracking and signal linkage to llm_usage (#23)
-- Also add trace_id for observability (#22)

-- Add signal_id column for per-signal cost aggregation
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS signal_id uuid REFERENCES signals(id) ON DELETE SET NULL;

-- Add trace_id for correlating logs across a pipeline run
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS trace_id text;

-- Add computed cost in USD
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS cost_usd numeric;

-- Indexes for efficient per-signal and per-trace queries
CREATE INDEX IF NOT EXISTS idx_llm_usage_signal_id ON llm_usage (signal_id) WHERE signal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_trace_id ON llm_usage (trace_id) WHERE trace_id IS NOT NULL;
