ALTER TABLE vault_artifacts DROP CONSTRAINT IF EXISTS vault_artifacts_project_id_fkey;
ALTER TABLE vault_artifacts ADD CONSTRAINT vault_artifacts_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
