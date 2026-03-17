ALTER TABLE projects ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE api_keys ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE webhook_configs ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE vault_artifacts ALTER COLUMN org_id SET NOT NULL;
-- llm_usage and audit_log: keep nullable (historical records may lack org)
-- messages.user_id: keep nullable (agent messages have no user)
