-- S4: Pipeline Checkpoint & Resume
-- Adds checkpoint persistence for the Architect pipeline phase.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS architect_phase_status TEXT
  CHECK (architect_phase_status IN ('running', 'completed', 'failed', 'timed_out'))
  DEFAULT NULL;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS architect_checkpoint JSONB;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS architect_result JSONB;
