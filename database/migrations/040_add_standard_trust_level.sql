-- Expand trust_level to include 'standard' tier (low-risk auto, medium/high need approval)
-- and change the default from 'collaborative' to 'standard'.

-- 1. Drop the old CHECK constraint
ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_trust_level_check;

-- 2. Add the new CHECK constraint with 'standard'
ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_trust_level_check
  CHECK (trust_level IN ('auto', 'standard', 'collaborative'));

-- 3. Change the column default to 'standard'
ALTER TABLE user_preferences
  ALTER COLUMN trust_level SET DEFAULT 'standard';

-- 4. Migrate existing rows from 'collaborative' to 'standard'
UPDATE user_preferences
  SET trust_level = 'standard'
  WHERE trust_level = 'collaborative';
