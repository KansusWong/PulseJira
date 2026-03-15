-- 041_clear_signal_history.sql
-- Clear all historical signal data while preserving table structure and source config.
-- Foreign key order: llm_usage, decisions → signals

BEGIN;

-- 1. Detach signals from llm_usage (SET NULL, keep usage records for billing)
UPDATE llm_usage SET signal_id = NULL WHERE signal_id IS NOT NULL;

-- 2. Delete decisions linked to signals
DELETE FROM decisions WHERE signal_id IS NOT NULL;

-- 3. Delete all signals
DELETE FROM signals;

-- 4. Reset collection timestamp so next cron run starts fresh
DELETE FROM system_config WHERE key = 'signal_last_collected_at';

-- 5. Reset last_fetched_at on all sources so they re-fetch from scratch
UPDATE signal_sources SET last_fetched_at = NULL;

COMMIT;
