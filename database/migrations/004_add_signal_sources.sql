-- Migration 004: Signal Sources and platform collection metadata
--
-- Adds a signal_sources table for configuring automatic collection
-- from Reddit, Twitter, YouTube, RSS feeds.
-- Extends the signals table with platform tracking fields.

CREATE TABLE IF NOT EXISTS signal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('reddit', 'twitter', 'youtube', 'rss', 'manual')),
  identifier text NOT NULL,
  label text NOT NULL,
  keywords text[] DEFAULT '{}',
  interval_minutes integer DEFAULT 60,
  active boolean DEFAULT true,
  last_fetched_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),

  UNIQUE(platform, identifier)
);

-- Extend signals table with collection metadata
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES signal_sources(id);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_signals_content_hash ON signals (content_hash);
CREATE INDEX IF NOT EXISTS idx_signals_external_id ON signals (external_id);
CREATE INDEX IF NOT EXISTS idx_signal_sources_active ON signal_sources (active);
