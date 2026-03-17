ALTER TABLE conversations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations(org_id);
