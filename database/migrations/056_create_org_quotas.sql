CREATE TABLE IF NOT EXISTS org_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period TEXT NOT NULL DEFAULT 'monthly',
  token_limit BIGINT NOT NULL,
  token_used BIGINT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id)
);
