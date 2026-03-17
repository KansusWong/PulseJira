-- Note: version (INTEGER) and id (TEXT) already exist from migration 042
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS version_label TEXT;
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'
  CHECK (status IN ('draft','published','deprecated','superseded'));
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(id);
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE vault_artifacts ADD COLUMN IF NOT EXISTS superseded_by TEXT;
