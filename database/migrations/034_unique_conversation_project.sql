-- Prevent duplicate project creation for the same conversation.
-- Even if application-layer locks fail, this unique partial index ensures
-- only one project can be linked to a given conversation_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_unique_conversation_id
  ON projects (conversation_id)
  WHERE conversation_id IS NOT NULL;
