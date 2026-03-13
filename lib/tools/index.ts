/**
 * Tool registry entry point.
 *
 * Registers built-in tools, then re-exports the dynamic registry API.
 * New tool names (read, write, edit, ls, bash) are primary;
 * old names (read_file, code_write, code_edit, list_files, run_command) are aliases.
 */

import { registerTool, getTools, getTool, getToolNames, isToolRegistered } from './tool-registry';
import { WebSearchTool } from './web-search';
import { FileReadTool } from './fs-read';
import { FileListTool } from './fs-list';
import { FinishPlanningTool } from './finish-planning';
import { FinishImplementationTool } from './finish-implementation';
import { FinishDeployTool } from './finish-deploy';
import { MergePRTool } from './merge-pr';
import { CheckCITool } from './check-ci';
import { TriggerDeployTool } from './trigger-deploy';
import { CheckHealthTool } from './check-health';
import { SearchVisionKnowledgeTool } from './search-vision-knowledge';
import { SearchDecisionsTool } from './search-decisions';
import { SearchCodeArtifactsTool } from './search-code-artifacts';
import { SearchCodePatternsTool } from './search-code-patterns';
import { FinishRetrievalTool } from './finish-retrieval';
import { FetchDailyDataTool } from './fetch-daily-data';
import { FinishDailyReportTool } from './finish-daily-report';
import { StoreCodePatternTool } from './store-code-pattern';
import { DiscoverSkillsTool } from './discover-skills';
import { ReadSkillResourceTool } from './read-skill-resource';
import { FinishDecisionTool } from './finish-decision';
import { FinishArchitectTool } from './finish-architect';
import { ListAgentsTool } from './list-agents';
import { ValidateOutputTool } from './validate-output';
import { SpawnAgentTool } from './spawn-agent';
import { CreateAgentTool } from './create-agent';
import { CreateSkillTool } from './create-skill';
import { PersistAgentTool } from './persist-agent';
import { PersistSkillTool } from './persist-skill';
import { PromoteFeatureTool } from './promote-feature';
import { CreateSubAgentTool } from './create-sub-agent';

// --- New tools (Phase 2) ---
import { MultiEditTool } from './multi-edit';
import { GlobTool } from './glob';
import { GrepTool } from './grep';
import { EnterPlanModeTool, ExitPlanModeTool, AskUserQuestionTool } from './plan-mode';
import { TodoWriteTool, TodoReadTool } from './todo';
import { TaskTool } from './task';
import { MemoryTool } from './memory';

// ==========================================================================
// Phase 1: Renamed tools (new primary names + old aliases)
// ==========================================================================

// New names
registerTool('read', () => new FileReadTool());
registerTool('ls', () => new FileListTool());
// Old aliases (backward compat)
registerTool('read_file', () => new FileReadTool());
registerTool('list_files', () => new FileListTool());
// Note: write, edit, bash are workspace-scoped — registered below only as aliases
// for getTools() compatibility. Actual instances are created with workspace context.

// --- Global tools (no workspace dependency) ---
registerTool('web_search', () => new WebSearchTool());
registerTool('finish_planning', () => new FinishPlanningTool());
registerTool('finish_implementation', () => new FinishImplementationTool());

// --- Deploy tools ---
registerTool('finish_deploy', () => new FinishDeployTool());
registerTool('merge_pr', () => new MergePRTool());
registerTool('check_ci', () => new CheckCITool());
registerTool('trigger_deploy', () => new TriggerDeployTool());
registerTool('check_health', () => new CheckHealthTool());

// --- Agentic RAG tools ---
registerTool('search_vision_knowledge', () => new SearchVisionKnowledgeTool());
registerTool('search_decisions', () => new SearchDecisionsTool());
registerTool('search_code_artifacts', () => new SearchCodeArtifactsTool());
registerTool('search_code_patterns', () => new SearchCodePatternsTool());
registerTool('finish_retrieval', () => new FinishRetrievalTool());
registerTool('fetch_daily_data', () => new FetchDailyDataTool());
registerTool('finish_daily_report', () => new FinishDailyReportTool());
registerTool('store_code_pattern', () => new StoreCodePatternTool());
registerTool('discover_skills', () => new DiscoverSkillsTool());
registerTool('read_skill_resource', () => new ReadSkillResourceTool());

// --- Meta-agent tools ---
registerTool('finish_decision', () => new FinishDecisionTool());
registerTool('finish_architect', () => new FinishArchitectTool());
registerTool('list_agents', () => new ListAgentsTool());
registerTool('validate_output', () => new ValidateOutputTool());
registerTool('spawn_agent', () => new SpawnAgentTool());
registerTool('create_agent', () => new CreateAgentTool());
registerTool('create_skill', () => new CreateSkillTool());
registerTool('persist_agent', () => new PersistAgentTool());
registerTool('persist_skill', () => new PersistSkillTool());
registerTool('promote_feature', () => new PromoteFeatureTool());
registerTool('create_sub_agent', () => new CreateSubAgentTool());

// ==========================================================================
// Phase 2: New tools
// ==========================================================================
registerTool('multi_edit', () => new MultiEditTool());
registerTool('glob', () => new GlobTool());
registerTool('grep', () => new GrepTool());
registerTool('enter_plan_mode', () => new EnterPlanModeTool());
registerTool('exit_plan_mode', () => new ExitPlanModeTool());
registerTool('ask_user_question', () => new AskUserQuestionTool());
registerTool('todo_write', () => new TodoWriteTool());
registerTool('todo_read', () => new TodoReadTool());
registerTool('task', () => new TaskTool());
registerTool('memory', () => new MemoryTool());

// --- Workspace-scoped tool factories ---
// These are NOT registered globally because they require runtime context.
// Import and instantiate them directly when creating workspace-scoped agents.
export { BlackboardReadTool } from './blackboard-read';
export { BlackboardWriteTool } from './blackboard-write';
export { CodeWriteTool } from './code-write';
export { CodeEditTool } from './code-edit';
export { GitCommitTool } from './git-commit';
export { GitCreatePRTool } from './git-create-pr';
export { RunCommandTool, BashBackgroundTool } from './run-command';
export { RunTestsTool } from './run-tests';
export { FinishImplementationTool } from './finish-implementation';
export { FinishDeployTool } from './finish-deploy';
export { MergePRTool } from './merge-pr';
export { CheckCITool } from './check-ci';
export { TriggerDeployTool } from './trigger-deploy';
export { CheckHealthTool } from './check-health';

// New tool exports
export { MultiEditTool } from './multi-edit';
export { GlobTool } from './glob';
export { GrepTool } from './grep';
export { EnterPlanModeTool, ExitPlanModeTool, AskUserQuestionTool } from './plan-mode';
export { TodoWriteTool, TodoReadTool, getActiveTodoSnapshot } from './todo';
export { TaskTool } from './task';
export { MemoryTool } from './memory';

// Shared infrastructure exports
export { getToolDescVersion, setToolDescVersion, selectDesc } from './tool-desc-version';
export { SubagentRegistry } from './subagent-registry';

// --- Re-export registry API ---
export { registerTool, getTools, getTool, getToolNames, isToolRegistered };
