/**
 * Side-effect module — registers the 8 core built-in agents.
 * Import this file (e.g. `import './builtin-agents'`) to ensure
 * the registry is populated before use.
 *
 * Sprint 13: Consolidated from 16 agents to 8 core agents.
 */
import { registerAgent } from './agent-registry';
import { DECISION_MAKER_PROMPT } from '@/lib/prompts/decision-maker';
import { ARCHITECT_PROMPT } from '@/lib/prompts/architect';

// --- Planner (merged: pm + tech-lead + orchestrator) ---

registerAgent({
  id: 'planner',
  displayName: 'Planner',
  role: '需求→PRD→任务拆解→implementation DAG（通过 mode 切换）',
  runMode: 'react',
  defaultMaxLoops: 25,
  defaultPrompt: '',
  tools: [
    { name: 'web_search', description: '搜索网络获取技术参考' },
    { name: 'list_files', description: '列出目录结构' },
    { name: 'read_file', description: '读取文件内容' },
    { name: 'finish_planning', description: '提交计划' },
  ],
  skills: [
    { name: 'generate-prd', description: '生成结构化 PRD (mode: prd)' },
    { name: 'plan-tasks', description: '探索代码库并生成任务计划 (mode: task-plan)' },
    { name: 'orchestrate', description: '生成实现 DAG (mode: implementation-dag)' },
  ],
});

// --- Analyst (merged: researcher + blue-team + critic + arbitrator + knowledge-curator) ---

registerAgent({
  id: 'analyst',
  displayName: 'Analyst',
  role: '信号评估全链路：研究/论证/批判/裁决/检索（通过 mode 切换）',
  runMode: 'react',
  defaultMaxLoops: 10,
  defaultPrompt: '',
  tools: [
    { name: 'web_search', description: '搜索网络获取市场/竞品信息' },
    { name: 'search_vision_knowledge', description: '搜索项目愿景知识库' },
    { name: 'search_decisions', description: '搜索历史决策记录' },
    { name: 'search_code_artifacts', description: '搜索代码工件' },
    { name: 'search_code_patterns', description: '搜索代码模式库' },
    { name: 'finish_retrieval', description: '提交结构化上下文包并退出' },
  ],
  skills: [
    { name: 'market-scan', description: '搜索竞品和市场信息 (mode: research)' },
    { name: 'build-case', description: '构建商业论证方案 (mode: advocate)' },
    { name: 'adversarial-review', description: '对抗性风险审查 (mode: critique)' },
    { name: 'render-verdict', description: '仲裁裁决 (mode: arbitrate)' },
    { name: 'multi-hop-retrieval', description: '多跳知识检索 (mode: retrieve)' },
  ],
});

// --- Reviewer (merged: qa-engineer + code-reviewer + supervisor) ---

registerAgent({
  id: 'reviewer',
  displayName: 'Reviewer',
  role: '质量门控全链路：测试/代码审查/产出验证（通过 mode 切换）',
  runMode: 'react',
  defaultMaxLoops: 10,
  defaultPrompt: '',
  tools: [
    { name: 'list_files', description: '列出目录结构' },
    { name: 'read_file', description: '读取文件内容' },
    { name: 'run_tests', description: '运行测试' },
    { name: 'run_command', description: '执行命令' },
    { name: 'validate_output', description: '程序化验证产出' },
    { name: 'finish_implementation', description: '提交验证/审查报告' },
  ],
  skills: [
    { name: 'quality-assurance', description: '运行测试并验证代码质量 (mode: qa)' },
    { name: 'code-review', description: '审查代码变更 (mode: review)' },
    { name: 'quality-gate', description: '验证 Agent 产出质量 (mode: supervise)' },
  ],
});

// --- Chat Assistant (L1 direct conversation handler) ---

registerAgent({
  id: 'chat-assistant',
  displayName: 'Chat Assistant',
  role: '通用对话助手，处理 L1 级别问答和信息查询',
  runMode: 'react',
  defaultMaxLoops: 3,
  defaultPrompt: '',
  tools: [
    { name: 'web_search', description: '搜索网络获取实时信息' },
    { name: 'read_file', description: '读取文件内容' },
    { name: 'list_files', description: '列出目录结构' },
  ],
  skills: [],
});

// --- Chat Judge (renamed from complexity-assessor) — internal classifier ---

registerAgent({
  id: 'chat-judge',
  displayName: 'Chat Judge',
  role: '用户需求复杂度评估（L1/L2/L3）',
  runMode: 'single-shot',
  defaultMaxLoops: 1,
  defaultPrompt: '',
  tools: [],
  skills: [],
  internal: true,
});

// --- Preserved agents ---

registerAgent({
  id: 'developer',
  displayName: 'Developer',
  role: '根据任务描述生成代码',
  runMode: 'react',
  defaultMaxLoops: 20,
  defaultPrompt: '',
  tools: [
    { name: 'list_files', description: '列出目录结构' },
    { name: 'read_file', description: '读取文件内容' },
    { name: 'code_write', description: '创建新文件' },
    { name: 'code_edit', description: '编辑已有文件' },
    { name: 'run_command', description: '执行命令' },
    { name: 'run_tests', description: '运行测试' },
    { name: 'git_commit', description: '提交代码' },
    { name: 'finish_implementation', description: '提交实现报告' },
  ],
  skills: [{ name: 'code-generation', description: '探索代码库并生成代码实现' }],
});

registerAgent({
  id: 'deployer',
  displayName: 'Deployer',
  role: 'GitHub 项目管理（分支管理）与项目部署',
  runMode: 'react',
  defaultMaxLoops: 15,
  defaultPrompt: '',
  tools: [
    { name: 'merge_pr', description: '合并 GitHub Pull Request' },
    { name: 'check_ci', description: '检查 CI 状态' },
    { name: 'trigger_deploy', description: '触发部署' },
    { name: 'check_health', description: '执行 HTTP 健康检查' },
    { name: 'finish_deploy', description: '提交部署报告' },
  ],
  skills: [{ name: 'deploy-pipeline', description: '自动合并、部署和健康检查' }],
});

registerAgent({
  id: 'decision-maker',
  displayName: 'Decision Maker',
  role: '收集高价值信息并输出结构化决策，支持信号聚合',
  runMode: 'react',
  defaultMaxLoops: 15,
  defaultPrompt: DECISION_MAKER_PROMPT,
  tools: [
    { name: 'spawn_agent', description: '调用子 Agent 获取专业分析' },
    { name: 'list_agents', description: '查看所有可用 Agent' },
    { name: 'web_search', description: '搜索网络获取信息' },
    { name: 'search_vision_knowledge', description: '搜索项目愿景知识库' },
    { name: 'search_decisions', description: '搜索历史决策记录' },
    { name: 'finish_decision', description: '提交结构化决策并退出' },
  ],
  skills: [{ name: 'strategic-decision', description: '多源信息聚合与结构化决策' }],
});

registerAgent({
  id: 'architect',
  displayName: 'Architect',
  role: '自适应执行引擎，动态编排 Agent/Skill/工具完成任务',
  runMode: 'react',
  defaultMaxLoops: 50,
  defaultPrompt: ARCHITECT_PROMPT,
  tools: [
    { name: 'spawn_agent', description: '调用子 Agent 执行子任务' },
    { name: 'list_agents', description: '查看所有可用 Agent' },
    { name: 'create_agent', description: '动态创建新 Agent' },
    { name: 'create_skill', description: '动态创建新 Skill' },
    { name: 'persist_agent', description: '将临时 Agent 持久化到磁盘' },
    { name: 'validate_output', description: '程序化验证产出' },
    { name: 'discover_skills', description: '搜索可用 Skill' },
    { name: 'web_search', description: '搜索网络' },
    { name: 'list_files', description: '列出目录结构' },
    { name: 'read_file', description: '读取文件内容' },
    { name: 'finish_architect', description: '提交执行报告并退出' },
  ],
  skills: [{ name: 'adaptive-execution', description: '自适应任务编排与执行' }],
});

// --- AI-generated (persisted) agents ---
// Dynamic agents are now lazy-loaded via ensureDynamicAgentsLoaded().
// Only called when L3 agent_team, list_agents, or spawn_agent actually need them.
