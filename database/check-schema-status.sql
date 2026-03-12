-- ============================================================================
-- Schema Status Check Script
-- 在 Supabase SQL Editor 中执行，合并为一个查询返回所有检查结果
-- ============================================================================

WITH

-- 1. 表存在性检查
table_check AS (
  SELECT
    '1-表' AS check_type,
    expected_table AS item,
    '' AS sub_item,
    CASE WHEN t.tablename IS NOT NULL THEN '✅ 存在' ELSE '❌ 缺失' END AS status,
    source
  FROM (VALUES
    ('vision_knowledge', 'schema.sql'),
    ('signals',          'schema.sql'),
    ('decisions',        'schema.sql'),
    ('tasks',            'schema.sql'),
    ('subscriptions',    'schema.sql'),
    ('rejection_logs',   'schema.sql'),
    ('projects',              '001_add_projects'),
    ('agent_runs',            '002_add_agent_runs'),
    ('signal_sources',        '004_add_signal_sources'),
    ('agent_templates',       '006_add_agent_templates'),
    ('agent_instances',       '006_add_agent_templates'),
    ('implementation_plans',  '007_add_implementation'),
    ('implementation_tasks',  '007_add_implementation'),
    ('code_artifacts',        '007_add_implementation'),
    ('workspaces',            '008_add_workspaces'),
    ('deployments',           '009_add_deployments'),
    ('code_patterns',         '010_add_agentic_rag'),
    ('skill_embeddings',      '010_add_agentic_rag'),
    ('user_preferences',      '011_add_user_preferences'),
    ('llm_usage',             '013_add_llm_usage'),
    ('llm_failover_events',   '016_add_llm_failover_events'),
    ('blackboard_entries',    '020_add_blackboard'),
    ('conversations',         '021_chat_first'),
    ('messages',              '021_chat_first'),
    ('agent_teams',           '021_chat_first'),
    ('agent_mailbox',         '021_chat_first'),
    ('team_tasks',            '021_chat_first'),
    ('system_config',         '021_chat_first'),
    ('api_keys',              '022_add_auth_rbac'),
    ('audit_log',             '022_add_auth_rbac'),
    ('execution_traces',      '026_add_execution_traces'),
    ('execution_events',      '026_add_execution_traces'),
    ('tool_approval_audits',  '028_add_tool_approval_audits'),
    ('webhook_configs',       '030_add_webhooks')
  ) AS expected(expected_table, source)
  LEFT JOIN pg_tables t ON t.tablename = expected.expected_table AND t.schemaname = 'public'
),

-- 2. 关键列存在性检查
column_check AS (
  SELECT
    '2-列' AS check_type,
    expected_table AS item,
    expected_column AS sub_item,
    CASE WHEN c.column_name IS NOT NULL THEN '✅ 存在' ELSE '❌ 缺失' END AS status,
    source
  FROM (VALUES
    ('tasks',             'project_id',                '003'),
    ('signals',           'source_id',                 '004'),
    ('signals',           'external_id',               '004'),
    ('signals',           'external_url',              '004'),
    ('signals',           'content_hash',              '004'),
    ('signals',           'platform',                  '004'),
    ('signals',           'metadata',                  '004'),
    ('projects',          'implementation_plan_id',    '007'),
    ('projects',          'workspace_id',              '007'),
    ('projects',          'pr_url',                    '007'),
    ('projects',          'deployment_id',             '009'),
    ('projects',          'deployment_url',            '009'),
    ('projects',          'deployment_status',         '009'),
    ('projects',          'deployed_at',               '009'),
    ('code_artifacts',    'embedding',                 '010'),
    ('projects',          'implementation_plan',       '012'),
    ('llm_usage',         'account_id',               '015'),
    ('llm_usage',         'account_name',             '015'),
    ('llm_usage',         'signal_id',                '018'),
    ('llm_usage',         'trace_id',                 '018'),
    ('llm_usage',         'cost_usd',                 '018'),
    ('llm_usage',         'duration_ms',              '019a'),
    ('signal_sources',    'config',                   '019b'),
    ('subscriptions',     'system_enabled',           '021'),
    ('subscriptions',     'max_items_per_fetch',      '021'),
    ('subscriptions',     'fetch_interval_hours',     '021'),
    ('conversations',     'clarification_round',      '022b'),
    ('conversations',     'clarification_context',    '022b'),
    ('projects',          'is_light',                 '022b'),
    ('projects',          'conversation_id',          '022b'),
    ('conversations',     'dm_decision',              '023'),
    ('conversations',     'dm_approval_status',       '023'),
    ('conversations',     'structured_requirements',  '024'),
    ('conversations',     'pending_tool_approval',    '024'),
    ('conversations',     'architect_phase_status',   '025'),
    ('conversations',     'architect_checkpoint',     '025'),
    ('conversations',     'architect_result',         '025'),
    ('user_preferences',  'agent_execution_mode',     '029'),
    ('webhook_configs',   'message_template',         '031'),
    ('webhook_configs',   'display_name',             '032'),
    ('user_preferences',  'trust_level',              '033'),
    ('projects',          'agent_logs',               '035'),
    ('projects',          'pipeline_checkpoint',      '035'),
    ('conversations',     'assessed_at_message_count','036')
  ) AS expected(expected_table, expected_column, source)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
    AND c.table_name = expected.expected_table
    AND c.column_name = expected.expected_column
),

-- 3. RPC 函数检查
func_check AS (
  SELECT
    '3-函数' AS check_type,
    expected_func AS item,
    '' AS sub_item,
    CASE WHEN p.proname IS NOT NULL THEN '✅ 存在' ELSE '❌ 缺失' END AS status,
    source
  FROM (VALUES
    ('match_vision_knowledge',  'schema.sql'),
    ('match_decisions',         'schema.sql'),
    ('match_code_patterns',     '010_add_agentic_rag'),
    ('match_skills',            '010_add_agentic_rag'),
    ('match_code_artifacts',    '010_add_agentic_rag')
  ) AS expected(expected_func, source)
  LEFT JOIN pg_proc p ON p.proname = expected.expected_func
    AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
),

-- 4. Embedding 维度检查
embedding_check AS (
  SELECT
    '4-向量维度' AS check_type,
    cols.table_name AS item,
    cols.column_name AS sub_item,
    CASE
      WHEN a.atttypmod = 256 THEN '✅ 256维'
      WHEN a.atttypmod > 0 THEN '⚠️ ' || a.atttypmod::text || '维'
      ELSE '⚠️ 未知维度'
    END AS status,
    '' AS source
  FROM information_schema.columns cols
  JOIN pg_attribute a
    ON a.attname = cols.column_name
  JOIN pg_class c
    ON a.attrelid = c.oid AND c.relname = cols.table_name
  JOIN pg_namespace n
    ON c.relnamespace = n.oid AND n.nspname = 'public'
  WHERE cols.table_schema = 'public'
    AND cols.udt_name = 'vector'
),

-- 5. 关键索引检查
index_check AS (
  SELECT
    '5-索引' AS check_type,
    expected_index AS item,
    '' AS sub_item,
    CASE WHEN i.indexname IS NOT NULL THEN '✅ 存在' ELSE '❌ 缺失' END AS status,
    '' AS source
  FROM (VALUES
    ('idx_projects_status'),
    ('idx_projects_updated_at'),
    ('idx_projects_unique_conversation_id'),
    ('idx_agent_runs_project'),
    ('idx_agent_runs_status'),
    ('idx_signals_status'),
    ('idx_signals_content_hash'),
    ('idx_signals_external_id'),
    ('idx_decisions_signal_id'),
    ('idx_tasks_status'),
    ('idx_tasks_project'),
    ('idx_tasks_decision_id'),
    ('idx_llm_usage_project_used_at'),
    ('idx_llm_usage_used_at'),
    ('idx_llm_usage_account_id'),
    ('idx_llm_usage_signal_id'),
    ('idx_llm_usage_trace_id'),
    ('idx_llm_usage_duration_ms'),
    ('idx_bb_execution'),
    ('idx_bb_project'),
    ('idx_bb_exec_key'),
    ('idx_bb_exec_type'),
    ('idx_bb_tags'),
    ('idx_bb_exec_key_version'),
    ('idx_messages_conversation'),
    ('idx_mailbox_recipient'),
    ('idx_mailbox_created_at'),
    ('idx_team_tasks_blocked'),
    ('idx_api_keys_key_hash'),
    ('idx_api_keys_active'),
    ('idx_audit_log_created_at'),
    ('idx_exec_traces_project'),
    ('idx_exec_events_trace_seq'),
    ('idx_tool_approval_audits_conversation'),
    ('idx_webhook_configs_active'),
    ('idx_signal_sources_active'),
    ('idx_signal_sources_platform')
  ) AS expected(expected_index)
  LEFT JOIN pg_indexes i
    ON i.schemaname = 'public'
    AND i.indexname = expected.expected_index
),

-- 6. pgvector 扩展检查
ext_check AS (
  SELECT
    '6-扩展' AS check_type,
    'pgvector' AS item,
    COALESCE(extversion, '') AS sub_item,
    CASE WHEN extname IS NOT NULL THEN '✅ 已安装' ELSE '❌ 未安装' END AS status,
    '' AS source
  FROM (SELECT 1) AS dummy
  LEFT JOIN pg_extension ON extname = 'vector'
)

-- 合并所有检查结果
SELECT check_type, item, sub_item, status, source FROM table_check
UNION ALL
SELECT check_type, item, sub_item, status, source FROM column_check
UNION ALL
SELECT check_type, item, sub_item, status, source FROM func_check
UNION ALL
SELECT check_type, item, sub_item, status, source FROM embedding_check
UNION ALL
SELECT check_type, item, sub_item, status, source FROM index_check
UNION ALL
SELECT check_type, item, sub_item, status, source FROM ext_check
ORDER BY check_type, source, item, sub_item;
