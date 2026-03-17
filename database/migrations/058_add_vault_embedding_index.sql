ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS embedding vector(256);
CREATE INDEX IF NOT EXISTS vault_artifacts_embedding_idx ON vault_artifacts
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS vault_artifacts_org_status_idx ON vault_artifacts(org_id, status);
CREATE INDEX IF NOT EXISTS vault_artifacts_org_type_idx ON vault_artifacts(org_id, artifact_type);
