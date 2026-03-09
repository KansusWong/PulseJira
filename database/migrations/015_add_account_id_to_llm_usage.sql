-- Migration 015: Add account tracking columns to llm_usage for LLM Pool
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS account_name text;

CREATE INDEX IF NOT EXISTS idx_llm_usage_account_id ON llm_usage (account_id, used_at DESC);
