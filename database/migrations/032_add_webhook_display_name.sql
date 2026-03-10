-- Add display_name column to webhook_configs for personalized greetings
-- NULL = no greeting, existing rows unaffected
ALTER TABLE webhook_configs
  ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT NULL;
