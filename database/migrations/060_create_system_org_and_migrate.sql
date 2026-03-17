-- Create system org for historical data
INSERT INTO organizations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'System', 'system', 'enterprise')
ON CONFLICT (slug) DO NOTHING;

-- Create system user for historical data
INSERT INTO users (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'system@internal', 'System')
ON CONFLICT (email) DO NOTHING;

-- Make system user owner of system org
INSERT INTO org_members (org_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Backfill org_id on all existing tables
UPDATE projects SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE projects SET created_by = '00000000-0000-0000-0000-000000000001' WHERE created_by IS NULL;
UPDATE conversations SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE conversations SET created_by = '00000000-0000-0000-0000-000000000001' WHERE created_by IS NULL;
UPDATE api_keys SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE llm_usage SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE webhook_configs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE audit_log SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE vault_artifacts SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
