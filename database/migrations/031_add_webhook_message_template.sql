-- Add message_template column to webhook_configs
-- NULL = use default format, existing rows unaffected
ALTER TABLE webhook_configs
  ADD COLUMN IF NOT EXISTS message_template TEXT DEFAULT NULL;
