/**
 * Dynamic Tool Registry — single source of truth for tool factories.
 *
 * Mirrors the agent-registry pattern: Map-backed, open for extension.
 * Tools are registered by name and created fresh on each `getTool()` call.
 *
 * For global (stateless) tools, use `getToolCached()` / `getToolsCached()`
 * to reuse singleton instances across requests — avoids repeated instantiation
 * and zodToJsonSchema conversion.
 */
import type { BaseTool } from '../core/base-tool';

type ToolFactory = () => BaseTool;

const registry = new Map<string, ToolFactory>();

/** Cached singleton instances for stateless global tools. */
const instanceCache = new Map<string, BaseTool>();

/** Register a tool factory by name. Overwrites any previous registration. */
export function registerTool(name: string, factory: ToolFactory): void {
  registry.set(name, factory);
  // Invalidate cached instance when factory changes
  instanceCache.delete(name);
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

/**
 * Get a cached singleton tool instance by name.
 * Use for stateless global tools that don't require workspace context.
 * The instance is created once and reused across calls.
 */
export function getToolCached(name: string): BaseTool {
  const cached = instanceCache.get(name);
  if (cached) return cached;

  const factory = registry.get(name);
  if (!factory) {
    throw new Error(
      `Unknown tool: "${name}". Registered tools: [${Array.from(registry.keys()).join(', ')}]`
    );
  }
  const instance = factory();
  instanceCache.set(name, instance);
  return instance;
}

/** Get fresh instances of multiple tools by name. */
export function getTools(...names: string[]): BaseTool[] {
  return names.map((name) => getTool(name));
}

/** Get cached singleton instances of multiple tools by name. */
export function getToolsCached(...names: string[]): BaseTool[] {
  return names.map((name) => getToolCached(name));
}

/** List all registered tool names. */
export function getToolNames(): string[] {
  return Array.from(registry.keys());
}

/** Check whether a tool is registered. */
export function isToolRegistered(name: string): boolean {
  return registry.has(name);
}
