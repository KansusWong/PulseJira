/**
 * Tool registry entry point.
 *
 * Registers built-in tools, then re-exports the dynamic registry API.
 * Existing callers using `getTools('web_search', 'read_file')` continue
 * to work — the function signature is the same, but now backed by a Map
 * instead of a closed Record.
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
import { RAGRetrieveTool } from './rag-retrieve';
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

// --- Register built-in tools (global, no workspace dependency) ---
registerTool('web_search', () => new WebSearchTool());
registerTool('read_file', () => new FileReadTool());
registerTool('list_files', () => new FileListTool());
registerTool('finish_planning', () => new FinishPlanningTool());
registerTool('finish_implementation', () => new FinishImplementationTool());

// --- Deploy tools (no workspace dependency) ---
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
registerTool('rag_retrieve', () => new RAGRetrieveTool());
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

// --- Workspace-scoped tool factories ---
// These are NOT registered globally because they require runtime context.
// Import and instantiate them directly when creating workspace-scoped agents.
export { BlackboardReadTool } from './blackboard-read';
export { BlackboardWriteTool } from './blackboard-write';
export { CodeWriteTool } from './code-write';
export { CodeEditTool } from './code-edit';
export { GitCommitTool } from './git-commit';
export { GitCreatePRTool } from './git-create-pr';
export { RunCommandTool } from './run-command';
export { RunTestsTool } from './run-tests';
export { FinishImplementationTool } from './finish-implementation';
export { FinishDeployTool } from './finish-deploy';
export { MergePRTool } from './merge-pr';
export { CheckCITool } from './check-ci';
export { TriggerDeployTool } from './trigger-deploy';
export { CheckHealthTool } from './check-health';

// --- Re-export registry API ---
export { registerTool, getTools, getTool, getToolNames, isToolRegistered };
