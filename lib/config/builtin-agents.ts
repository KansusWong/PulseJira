/**
 * Side-effect module — registers built-in agents.
 * Import this file (e.g. `import './builtin-agents'`) to ensure
 * the registry is populated before use.
 *
 * RebuilD Architecture: Single agent replaces all previous agents.
 * Old agent registrations are commented out for reference.
 */
import { registerAgent } from './agent-registry';
import { REBUILD_SYSTEM_PROMPT } from '@/agents/rebuild/prompts/system';

// ==========================================================================
// RebuilD — single autonomous software engineering agent
// ==========================================================================

registerAgent({
  id: 'rebuild',
  displayName: 'RebuilD',
  role: '通用 AI 助手，深度思考/规划/执行/反思',
  runMode: 'react',
  defaultMaxLoops: 30,
  defaultPrompt: REBUILD_SYSTEM_PROMPT,
  tools: [
    { name: 'read', description: '读取文件' },
    { name: 'write', description: '写入文件' },
    { name: 'edit', description: '编辑文件' },
    { name: 'multi_edit', description: '批量编辑' },
    { name: 'ls', description: '浏览目录' },
    { name: 'glob', description: '搜索文件' },
    { name: 'grep', description: '搜索内容' },
    { name: 'bash', description: '执行命令' },
    { name: 'web_search', description: '搜索网络' },
    { name: 'enter_plan_mode', description: '进入计划模式' },
    { name: 'exit_plan_mode', description: '提交计划' },
    { name: 'ask_user_question', description: '向用户提问' },
    { name: 'todo_write', description: '管理任务清单' },
    { name: 'todo_read', description: '查看任务清单' },
    { name: 'task', description: '创建独立子Agent' },
    { name: 'run_tests', description: '运行测试' },
    { name: 'git_commit', description: 'Git 提交' },
    { name: 'blackboard_read', description: '读取黑板' },
    { name: 'blackboard_write', description: '写入黑板' },
    { name: 'discover_skills', description: '发现技能' },
    { name: 'read_skill_resource', description: '读取技能资源' },
    { name: 'semantic_search', description: '语义搜索知识库' },
    { name: 'store_code_pattern', description: '存储代码模式' },
  ],
  skills: [],
});
