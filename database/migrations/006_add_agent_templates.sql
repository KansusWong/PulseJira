-- Migration 006: Agent Templates and Dynamic Agent Instances
--
-- Templates define reusable agent role configurations.
-- Instances are dynamically created per project for implementation.

CREATE TABLE IF NOT EXISTS agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  description text NOT NULL,
  run_mode text CHECK (run_mode IN ('react', 'single-shot')) NOT NULL,
  default_model text,
  default_max_loops integer DEFAULT 10,
  default_tools text[] DEFAULT '{}',
  default_skills text[] DEFAULT '{}',
  prompt_template text NOT NULL,
  category text CHECK (category IN ('evaluation', 'planning', 'implementation', 'review', 'meta')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS agent_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  template_id text REFERENCES agent_templates(template_id),
  name text NOT NULL,
  custom_prompt text,
  custom_tools text[] DEFAULT '{}',
  custom_skills text[] DEFAULT '{}',
  status text CHECK (status IN ('created', 'running', 'completed', 'failed')) DEFAULT 'created',
  output jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  completed_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_instances_project ON agent_instances (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_instances_status ON agent_instances (status);
