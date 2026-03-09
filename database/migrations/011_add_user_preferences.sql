-- Migration 011: User Preferences persistence
--
-- Stores user signal-collection preferences (topics, platform configs)
-- so they survive process restarts. Single-row config table keyed by user_id.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id text PRIMARY KEY DEFAULT 'default',
  topics text[] DEFAULT '{}',
  platforms jsonb DEFAULT '{"reddit":{"enabled":false,"sources":[]},"twitter":{"enabled":false,"sources":[]},"youtube":{"enabled":false,"sources":[]}}',
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Seed a default row so upsert always works
INSERT INTO user_preferences (user_id) VALUES ('default')
ON CONFLICT (user_id) DO NOTHING;
