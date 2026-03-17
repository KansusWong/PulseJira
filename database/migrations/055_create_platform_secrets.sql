CREATE TABLE IF NOT EXISTS platform_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  key_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  provider TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, key_name)
);
CREATE INDEX idx_platform_secrets_provider ON platform_secrets(provider, is_active);
