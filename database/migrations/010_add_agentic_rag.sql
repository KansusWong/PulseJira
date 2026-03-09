-- 010_add_agentic_rag.sql
-- Agentic RAG: code_patterns, skill_embeddings, RPC functions
--
-- NOTE: Foreign keys to projects / implementation_tasks / code_artifacts are
-- intentionally omitted so this migration is self-contained.  They can be
-- added later with ALTER TABLE … ADD CONSTRAINT once the upstream tables
-- (001, 007) have been migrated.

-- ============================================================
-- 1. Code Patterns table
-- ============================================================
CREATE TABLE IF NOT EXISTS code_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,          -- logical FK → projects(id)
  task_id uuid,             -- logical FK → implementation_tasks(id)
  name text NOT NULL,
  description text NOT NULL,
  pattern_type text CHECK (pattern_type IN (
    'file_structure','architecture','api_pattern','component',
    'test_pattern','error_handling','data_model','other'
  )) NOT NULL DEFAULT 'other',
  content text NOT NULL,
  language text,
  tags text[] DEFAULT '{}',
  embedding vector(256),
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. Skill Embeddings table
-- ============================================================
CREATE TABLE IF NOT EXISTS skill_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id text UNIQUE NOT NULL,
  skill_name text NOT NULL,
  description text NOT NULL,
  tags text[] DEFAULT '{}',
  source text CHECK (source IN ('local','remote')) DEFAULT 'local',
  embedding vector(256),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 3. code_artifacts embedding column (safe — skipped if table missing)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'code_artifacts') THEN
    ALTER TABLE code_artifacts ADD COLUMN IF NOT EXISTS embedding vector(256);
  END IF;
END
$$;

-- ============================================================
-- 4. IVFFlat indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_code_patterns_embedding ON code_patterns
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_skill_embeddings_embedding ON skill_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- code_artifacts index — only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'code_artifacts') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_code_artifacts_embedding ON code_artifacts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50)';
  END IF;
END
$$;

-- ============================================================
-- 5. RPC: match_code_patterns
-- ============================================================
CREATE OR REPLACE FUNCTION match_code_patterns(
  query_embedding vector(256),
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 5,
  filter_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  pattern_type text,
  content text,
  language text,
  tags text[],
  usage_count integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.name,
    cp.description,
    cp.pattern_type,
    cp.content,
    cp.language,
    cp.tags,
    cp.usage_count,
    1 - (cp.embedding <=> query_embedding) AS similarity
  FROM code_patterns cp
  WHERE cp.embedding IS NOT NULL
    AND 1 - (cp.embedding <=> query_embedding) > match_threshold
    AND (filter_project_id IS NULL OR cp.project_id = filter_project_id)
  ORDER BY cp.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 6. RPC: match_skills
-- ============================================================
CREATE OR REPLACE FUNCTION match_skills(
  query_embedding vector(256),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  skill_id text,
  skill_name text,
  description text,
  tags text[],
  source text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.id,
    se.skill_id,
    se.skill_name,
    se.description,
    se.tags,
    se.source,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM skill_embeddings se
  WHERE se.embedding IS NOT NULL
    AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 7. RPC: match_code_artifacts (safe — returns empty if table missing)
-- ============================================================
CREATE OR REPLACE FUNCTION match_code_artifacts(
  query_embedding vector(256),
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  task_id uuid,
  type text,
  file_path text,
  content text,
  pr_url text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'code_artifacts') THEN
    RETURN QUERY EXECUTE
      'SELECT ca.id, ca.task_id, ca.type, ca.file_path, ca.content, ca.pr_url,
              1 - (ca.embedding <=> $1) AS similarity
       FROM code_artifacts ca
       WHERE ca.embedding IS NOT NULL
         AND 1 - (ca.embedding <=> $1) > $2
       ORDER BY ca.embedding <=> $1
       LIMIT $3'
    USING query_embedding, match_threshold, match_count;
  END IF;
END;
$$;
