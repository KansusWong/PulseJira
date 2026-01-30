-- Fix embedding dimensions from 1024 to 256 to match the actual API output

-- 1. Drop existing indexes that depend on the vector column
DROP INDEX IF EXISTS vision_knowledge_embedding_idx;
DROP INDEX IF EXISTS decisions_embedding_idx;
-- Also try dropping auto-generated names if the above were custom names (schema.sql didn't name them)
-- Postgres usually names them `tablename_columnname_idx`
DROP INDEX IF EXISTS vision_knowledge_embedding_idx1;
DROP INDEX IF EXISTS decisions_embedding_idx1;

-- 2. Alter tables to change vector dimension
ALTER TABLE vision_knowledge ALTER COLUMN embedding TYPE vector(256);
ALTER TABLE signals ALTER COLUMN embedding TYPE vector(256);
ALTER TABLE decisions ALTER COLUMN embedding TYPE vector(256);

-- 3. Recreate indexes
CREATE INDEX ON vision_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON decisions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. Update functions to accept vector(256)
-- First drop the old functions with 1024 signature
DROP FUNCTION IF EXISTS match_vision_knowledge(vector(1024), float, int);
DROP FUNCTION IF EXISTS match_decisions(vector(1024), float, int);

-- Recreate match_vision_knowledge
CREATE OR REPLACE FUNCTION match_vision_knowledge (
  query_embedding vector(256),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vision_knowledge.id,
    vision_knowledge.content,
    1 - (vision_knowledge.embedding <=> query_embedding) AS similarity
  FROM vision_knowledge
  WHERE 1 - (vision_knowledge.embedding <=> query_embedding) > match_threshold
  ORDER BY vision_knowledge.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Recreate match_decisions
CREATE OR REPLACE FUNCTION match_decisions (
  query_embedding vector(256),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  decision_rationale text,
  result_action jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    decisions.id,
    decisions.decision_rationale,
    decisions.result_action,
    1 - (decisions.embedding <=> query_embedding) AS similarity
  FROM decisions
  WHERE 1 - (decisions.embedding <=> query_embedding) > match_threshold
  ORDER BY decisions.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
