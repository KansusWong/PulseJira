/**
 * ToolContext — unified runtime context passed to tools during execution.
 *
 * Provides tools with access to workspace I/O, LLM calls, inter-tool chaining,
 * progress reporting, session-scoped caching, and identity metadata.
 *
 * Created once per BaseAgent.run() invocation and shared across all tool calls
 * in that session. Inspired by the CoreX ToolContext pattern.
 */

import type { StructuredLogger } from '@/lib/utils/logger';
import type { Blackboard } from '@/lib/blackboard/blackboard';
import type { ToolExecutionResult } from './types';
import type { BaseTool } from './base-tool';

// ---------------------------------------------------------------------------
// ToolContext — the unified runtime API available to every tool
// ---------------------------------------------------------------------------

export interface ToolContext {
  // --- Identity ---
  readonly agentName: string;
  readonly projectId?: string;
  readonly traceId: string;
  readonly sessionId: string;
  readonly workspacePath?: string;

  // --- File I/O (workspace-scoped, path-traversal protected) ---
  saveFile(relativePath: string, content: string): Promise<string>;
  readFile(relativePath: string): Promise<string>;

  // --- Secrets (env whitelist, read-only) ---
  readonly secrets: Readonly<Record<string, string>>;

  // --- HTTP Client (shared, with timeout) ---
  readonly httpClient: HttpClient;

  // --- LLM (delegates to agent's pool) ---
  callLlm(
    systemPrompt: string,
    userContent: string,
    options?: CallLlmOptions,
  ): Promise<any>;

  // --- Tool Chaining (depth-limited to prevent recursion) ---
  callTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<ToolExecutionResult>;

  // --- Session Cache (per-run Map, survives across tool calls) ---
  readonly cache: Map<string, any>;

  // --- Progress Reporting (→ messageBus → frontend SSE) ---
  reportProgress(message: string, percentage?: number): void;

  // --- Structured Logging ---
  readonly log: StructuredLogger;

  // --- Blackboard (optional, available during pipeline execution) ---
  readonly blackboard?: Blackboard;
}

// ---------------------------------------------------------------------------
// ToolContext internal variant (carries recursion depth tracking)
// ---------------------------------------------------------------------------

export interface ToolContextInternal extends ToolContext {
  readonly _callDepth: number;
  readonly _maxCallDepth: number;
  readonly _availableTools: Map<string, BaseTool>;
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface CallLlmOptions {
  /** Override model (defaults to agent's model). */
  model?: string;
  /** Pool tags for account routing. */
  poolTags?: string[];
  /** Max completion tokens. */
  maxTokens?: number;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  post(url: string, body: unknown, options?: HttpRequestOptions): Promise<HttpResponse>;
  put(url: string, body: unknown, options?: HttpRequestOptions): Promise<HttpResponse>;
  delete(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  /** Request timeout in ms (default: 30000). */
  timeout?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  json<T = any>(): T;
}

// ---------------------------------------------------------------------------
// Tool safety configuration (per-tool, overridable)
// ---------------------------------------------------------------------------

export interface ToolSafetyConfig {
  /** Per-tool execution timeout in ms. */
  timeout: number;
  /** Number of automatic retries on failure. */
  retryCount: number;
  /** Max result string length before truncation. */
  maxResultSize: number;
}

export const DEFAULT_TOOL_SAFETY: ToolSafetyConfig = {
  timeout: 120_000,
  retryCount: 0,
  maxResultSize: 25_000,
};
