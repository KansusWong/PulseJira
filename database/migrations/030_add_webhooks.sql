-- Sprint 14: Webhook notification configs
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('feishu', 'dingtalk', 'slack', 'wecom', 'custom')),
  label TEXT NOT NULL DEFAULT '',
  webhook_url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{"pipeline_complete","deploy_complete","deploy_failed"}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_active ON webhook_configs(active);
