-- Migration 039: Add memory_entries and todo_items tables
-- Persists cross-session memory and per-conversation todo lists to Supabase.

-- ============================================================
-- Memory entries — 跨会话持久化记忆
-- ============================================================
CREATE TABLE IF NOT EXISTS memory_entries (
  id            text PRIMARY KEY,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id  uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  content       text NOT NULL,
  tags          text[] DEFAULT '{}',
  category      text NOT NULL DEFAULT 'fact'
                CHECK (category IN ('fact', 'procedure', 'context')),
  importance    integer NOT NULL DEFAULT 5
                CHECK (importance BETWEEN 1 AND 10),
  created_at    timestamptz DEFAULT timezone('utc', now()),
  updated_at    timestamptz DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_memory_project     ON memory_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_memory_workspace   ON memory_entries (workspace_id);
CREATE INDEX IF NOT EXISTS idx_memory_category    ON memory_entries (category);
CREATE INDEX IF NOT EXISTS idx_memory_importance  ON memory_entries (importance DESC);
CREATE INDEX IF NOT EXISTS idx_memory_tags        ON memory_entries USING GIN (tags);

-- ============================================================
-- Todo items — 会话级任务列表
-- ============================================================
CREATE TABLE IF NOT EXISTS todo_items (
  id              text NOT NULL,
  conversation_id text NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  content         text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  dependencies    text[] DEFAULT '{}',
  created_at      timestamptz DEFAULT timezone('utc', now()),
  updated_at      timestamptz DEFAULT timezone('utc', now()),
  PRIMARY KEY (conversation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_todo_conversation  ON todo_items (conversation_id);
CREATE INDEX IF NOT EXISTS idx_todo_project       ON todo_items (project_id);
CREATE INDEX IF NOT EXISTS idx_todo_status        ON todo_items (status);
