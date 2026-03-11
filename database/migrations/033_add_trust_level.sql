-- Add trust_level column to user_preferences
-- Values: 'auto' (skip tool approval in architect phase) or 'collaborative' (default, require approval)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS trust_level text
  NOT NULL DEFAULT 'collaborative'
  CHECK (trust_level IN ('auto', 'collaborative'));
