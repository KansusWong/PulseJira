/**
 * ToolContext Factory — constructs a ToolContext from agent runtime parameters.
 *
 * Created once per BaseAgent.run() invocation. The resulting context is shared
 * across all tool calls within that agent session.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { generateJSON } from './llm';
import { createStructuredLogger, generateTraceId } from '@/lib/utils/logger';
import { messageBus } from '@/connectors/bus/message-bus';
import type { AgentContext, ToolExecutionResult } from './types';
import type { BaseTool } from './base-tool';
import type {
  ToolContext,
  ToolContextInternal,
  CallLlmOptions,
  HttpClient,
  HttpResponse,
  HttpRequestOptions,
} from './tool-context';

// ---------------------------------------------------------------------------
// Factory params
// ---------------------------------------------------------------------------

export interface CreateToolContextParams {
  agentName: string;
  agentContext: AgentContext;
  tools: BaseTool[];
  workspacePath?: string;
  poolTags?: string[];
  model?: string;
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

export function createToolContext(params: CreateToolContextParams): ToolContextInternal {
  const {
    agentName,
    agentContext,
    tools,
    workspacePath,
    poolTags,
    model,
  } = params;

  const traceId = agentContext.traceId || generateTraceId();
  const sessionId = `session-${crypto.randomUUID().slice(0, 12)}`;
  const log = createStructuredLogger({ traceId, agent: agentName });
  const cache = new Map<string, any>();

  // Build tool lookup map
  const toolMap = new Map<string, BaseTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Resolve and normalize workspace root once
  // (bind to local const to avoid Turbopack TP1006 "very dynamic" lint warning)
  const wsPath: string = workspacePath || '';
  const resolvedWorkspace = wsPath ? path.resolve(wsPath) : undefined;

  const secrets = buildSecrets();
  const httpClient = createHttpClient();

  const ctx: ToolContextInternal = {
    // --- Identity ---
    agentName,
    projectId: agentContext.projectId,
    orgId: agentContext.orgId,
    traceId,
    sessionId,
    workspacePath: resolvedWorkspace,

    // --- File I/O ---
    saveFile: async (relativePath: string, content: string): Promise<string> => {
      if (!resolvedWorkspace) {
        throw new Error('ToolContext: No workspace configured — cannot save files.');
      }
      const resolved = resolveSafePath(resolvedWorkspace, relativePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf-8');
      return resolved;
    },

    readFile: async (relativePath: string): Promise<string> => {
      if (!resolvedWorkspace) {
        throw new Error('ToolContext: No workspace configured — cannot read files.');
      }
      const resolved = resolveSafePath(resolvedWorkspace, relativePath);
      return fs.readFileSync(resolved, 'utf-8');
    },

    // --- Secrets ---
    secrets,

    // --- HTTP ---
    httpClient,

    // --- LLM ---
    callLlm: async (
      systemPrompt: string,
      userContent: string,
      options?: CallLlmOptions,
    ): Promise<any> => {
      return generateJSON(systemPrompt, userContent, {
        model: options?.model || model,
        poolTags: options?.poolTags || poolTags,
        agentName,
        projectId: agentContext.projectId,
        traceId,
        onUsage: agentContext.recordUsage
          ? (usage) => agentContext.recordUsage!({
              agentName,
              projectId: agentContext.projectId,
              model: usage.model || model,
              prompt_tokens: usage.prompt_tokens,
              completion_tokens: usage.completion_tokens,
              total_tokens: usage.total_tokens,
            })
          : undefined,
      });
    },

    // --- Tool Chaining ---
    callTool: async (
      toolName: string,
      toolParams: Record<string, unknown>,
    ): Promise<ToolExecutionResult> => {
      if (ctx._callDepth >= ctx._maxCallDepth) {
        return {
          success: false,
          error: `Tool chaining depth limit reached (max: ${ctx._maxCallDepth}). Cannot call "${toolName}".`,
        };
      }

      const tool = toolMap.get(toolName);
      if (!tool) {
        return {
          success: false,
          error: `Tool "${toolName}" not found in current context. Available: [${Array.from(toolMap.keys()).join(', ')}].`,
        };
      }

      if (!tool.chainable) {
        return {
          success: false,
          error: `Tool "${toolName}" is not chainable — it cannot be called via callTool.`,
        };
      }

      // Child context with incremented depth
      const childCtx: ToolContextInternal = {
        ...ctx,
        _callDepth: ctx._callDepth + 1,
      };

      return tool.execute(toolParams, childCtx);
    },

    // --- Cache ---
    cache,

    // --- Progress ---
    reportProgress: (message: string, percentage?: number): void => {
      messageBus.publish({
        from: agentName,
        to: 'frontend',
        channel: 'agent-log',
        type: 'agent_log',
        payload: { message, percentage, traceId },
      });
    },

    // --- Logging ---
    log,

    // --- Blackboard ---
    blackboard: agentContext.blackboard,

    // --- Internal ---
    _callDepth: 0,
    _maxCallDepth: 3,
    _availableTools: toolMap,
  };

  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a relative path within a workspace root, preventing path traversal.
 */
function resolveSafePath(workspaceRoot: string, relativePath: string): string {
  if (!relativePath) {
    throw new Error('File path is required.');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error('File path must be relative, not absolute.');
  }
  if (relativePath.includes('\0')) {
    throw new Error('File path contains invalid null bytes.');
  }

  const resolved = path.resolve(workspaceRoot, relativePath);
  if (!resolved.startsWith(workspaceRoot + path.sep) && resolved !== workspaceRoot) {
    throw new Error(`Path traversal detected: "${relativePath}" resolves outside workspace.`);
  }

  return resolved;
}

/**
 * Build a read-only secrets object from whitelisted environment variables.
 */
function buildSecrets(): Readonly<Record<string, string>> {
  const ALLOWED_KEYS = [
    'GITHUB_TOKEN',
    'CRAWL4AI_API_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'OPENWEATHER_KEY',
    'DEEPSEEK_API_KEY',
  ];

  const secrets: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const val = process.env[key];
    if (val) secrets[key] = val;
  }
  return Object.freeze(secrets);
}

/**
 * Create a simple HTTP client wrapping native fetch with timeout support.
 */
function createHttpClient(): HttpClient {
  async function request(
    method: string,
    url: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeout = options?.timeout || 30_000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });

      return {
        status: res.status,
        headers,
        body: text,
        json<T = any>(): T { return JSON.parse(text); },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get: (url, opts) => request('GET', url, undefined, opts),
    post: (url, body, opts) => request('POST', url, body, opts),
    put: (url, body, opts) => request('PUT', url, body, opts),
    delete: (url, opts) => request('DELETE', url, undefined, opts),
  };
}
