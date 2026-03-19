-- Add highlighted flag for sidebar pinning
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS highlighted boolean NOT NULL DEFAULT false;
