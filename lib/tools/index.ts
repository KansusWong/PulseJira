/**
 * Tool registry entry point.
 *
 * Registers built-in tools, then re-exports the dynamic registry API.
 * New tool names (read, write, edit, ls, bash) are primary;
 * old names (read_file, code_write, code_edit, list_files, run_command) are aliases.
 */

import { registerTool, getTools, getToolsCached, getTool, getToolCached, getToolNames, isToolRegistered } from './tool-registry';
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
import { FetchDailyDataTool } from './fetch-daily-data';
import { FinishDailyReportTool } from './finish-daily-report';
import { StoreCodePatternTool } from './store-code-pattern';
import { DiscoverSkillsTool } from './discover-skills';
import { ReadSkillResourceTool } from './read-skill-resource';
import { FinishDecisionTool } from './finish-decision';
import { FinishArchitectTool } from './finish-architect';
import { ListAgentsTool } from './list-agents';
import { ValidateOutputTool } from './validate-output';
import { CreateSkillTool } from './create-skill';
import { PersistSkillTool } from './persist-skill';
import { PromoteFeatureTool } from './promote-feature';

// --- Phase 2 tools ---
import { MultiEditTool } from './multi-edit';
import { GlobTool } from './glob';
import { GrepTool } from './grep';
import { EnterPlanModeTool, ExitPlanModeTool, AskUserQuestionTool } from './plan-mode';
import { TodoWriteTool, TodoReadTool } from './todo';
import { TaskTool } from './task';

// --- Phase 3: New tools (core-tools alignment) ---
import { WebFetchTool } from './web-fetch';
import { SemanticSearchTool } from './semantic-search';
import { ExecuteCodeTool } from './execute-code';
import { ExecutePythonTool } from './execute-python';
import { PythonReplTool } from './python-repl';
import { CheckExecutorTool } from './check-executor';
import { ResetPythonEnvTool } from './reset-python-env';
import { ShowPythonVarsTool } from './show-python-vars';
import { BrowserTool } from './browser';
import { BrowseUrlTool } from './browse-url';
import { AnalyzeImageTool } from './analyze-image';
import { GenerateImageTool } from './generate-image';
import { EditImageTool } from './edit-image';
import { GenerateVideoTool } from './generate-video';
import { AutomationTool } from './automation';
import { ScreenshotTool } from './screenshot';
import { MouseClickTool } from './mouse-click';
import { KeyboardTypeTool } from './keyboard-type';
import { KeyboardHotkeyTool } from './keyboard-hotkey';
import { MouseMoveTool } from './mouse-move';
import { VisualizerTool } from './visualizer';

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

// --- Knowledge & RAG tools (unified semantic_search replaces 5 old tools) ---
registerTool('semantic_search', () => new SemanticSearchTool());
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
registerTool('create_skill', () => new CreateSkillTool());
registerTool('persist_skill', () => new PersistSkillTool());
registerTool('promote_feature', () => new PromoteFeatureTool());

// ==========================================================================
// Phase 2: Planning, Todo, Task tools
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
// NOTE: memory is now workspace-scoped only (registered in createRebuilDAgent)

// ==========================================================================
// Phase 3: New core-tools alignment
// ==========================================================================
registerTool('web_fetch', () => new WebFetchTool());
registerTool('execute_code', () => new ExecuteCodeTool());
registerTool('execute_python', () => new ExecutePythonTool());
registerTool('python_repl', () => new PythonReplTool());
registerTool('check_executor', () => new CheckExecutorTool());
registerTool('reset_python_env', () => new ResetPythonEnvTool());
registerTool('show_python_vars', () => new ShowPythonVarsTool());
registerTool('browser', () => new BrowserTool());
registerTool('browse_url', () => new BrowseUrlTool());
registerTool('analyze_image', () => new AnalyzeImageTool());
registerTool('generate_image', () => new GenerateImageTool());
registerTool('edit_image', () => new EditImageTool());
registerTool('generate_video', () => new GenerateVideoTool());
registerTool('automation', () => new AutomationTool());
registerTool('screenshot', () => new ScreenshotTool());
registerTool('mouse_click', () => new MouseClickTool());
registerTool('keyboard_type', () => new KeyboardTypeTool());
registerTool('keyboard_hotkey', () => new KeyboardHotkeyTool());
registerTool('mouse_move', () => new MouseMoveTool());
registerTool('visualizer', () => new VisualizerTool());

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
export { VaultTool } from './vault';

// Phase 3 tool exports
export { WebFetchTool } from './web-fetch';
export { ReadDocumentTool } from './read-document';
export { SemanticSearchTool } from './semantic-search';
export { ExecuteCodeTool } from './execute-code';
export { ExecutePythonTool } from './execute-python';
export { PythonReplTool } from './python-repl';
export { CheckExecutorTool } from './check-executor';
export { ResetPythonEnvTool } from './reset-python-env';
export { ShowPythonVarsTool } from './show-python-vars';
export { BrowserTool } from './browser';
export { BrowseUrlTool } from './browse-url';
export { AnalyzeImageTool } from './analyze-image';
export { GenerateImageTool } from './generate-image';
export { EditImageTool } from './edit-image';
export { GenerateVideoTool } from './generate-video';
export { AutomationTool } from './automation';
export { ScreenshotTool } from './screenshot';
export { MouseClickTool } from './mouse-click';
export { KeyboardTypeTool } from './keyboard-type';
export { KeyboardHotkeyTool } from './keyboard-hotkey';
export { MouseMoveTool } from './mouse-move';
export { VisualizerTool } from './visualizer';

// Shared infrastructure exports
export { getToolDescVersion, setToolDescVersion, selectDesc } from './tool-desc-version';
export { SubagentRegistry } from './subagent-registry';

// --- Re-export registry API ---
export { registerTool, getTools, getToolsCached, getTool, getToolCached, getToolNames, isToolRegistered };
