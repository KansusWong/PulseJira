ALTER TABLE webhook_configs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Also add org_id + visibility to vault_artifacts (needed before Task 5 extensions)
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'org'
  CHECK (visibility IN ('private','org','public'));
CREATE INDEX IF NOT EXISTS idx_vault_artifacts_org ON vault_artifacts(org_id);
