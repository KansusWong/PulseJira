/**
 * Dynamic Tool Registry — single source of truth for tool factories.
 *
 * Mirrors the agent-registry pattern: Map-backed, open for extension.
 * Tools are registered by name and created fresh on each `getTool()` call.
 */
import type { BaseTool } from '../core/base-tool';

type ToolFactory = () => BaseTool;

const registry = new Map<string, ToolFactory>();

/** Register a tool factory by name. Overwrites any previous registration. */
export function registerTool(name: string, factory: ToolFactory): void {
  registry.set(name, factory);
}

/** Get a fresh tool instance by name. Throws if not registered. */
export function getTool(name: string): BaseTool {
  const factory = registry.get(name);
  if (!factory) {
    throw new Error(
      `Unknown tool: "${name}". Registered tools: [${Array.from(registry.keys()).join(', ')}]`
    );
  }
  return factory();
}

/** Get fresh instances of multiple tools by name. */
export function getTools(...names: string[]): BaseTool[] {
  return names.map((name) => getTool(name));
}

/** List all registered tool names. */
export function getToolNames(): string[] {
  return Array.from(registry.keys());
}

/** Check whether a tool is registered. */
export function isToolRegistered(name: string): boolean {
  return registry.has(name);
}
