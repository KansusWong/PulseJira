/**
 * Shared tool registry — re-exports from lib/tools for the new directory structure.
 * Agent workspaces import from here: `import { getTools } from '@/tools'`
 */
export { getTools, getTool, registerTool, getToolNames, isToolRegistered } from '@/lib/tools/index';
export { WebSearchTool } from '@/lib/tools/web-search';
export { FileReadTool } from '@/lib/tools/fs-read';
export { FileListTool } from '@/lib/tools/fs-list';
export { FinishPlanningTool } from '@/lib/tools/finish-planning';
