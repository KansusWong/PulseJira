import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolExecutionResult } from './types';
import type { ToolContext, ToolSafetyConfig } from './tool-context';
import { DEFAULT_TOOL_SAFETY } from './tool-context';

export type ToolRiskLevel = 'low' | 'medium' | 'high';

// ---------------------------------------------------------------------------
// Module-level function definition cache — shared across all tool instances.
// Key: tool name, Value: { description, def }
// When the same tool name is requested with the same description, the cached
// def is reused, avoiding repeated zodToJsonSchema() conversion.
// ---------------------------------------------------------------------------
const _globalFunctionDefCache = new Map<
  string,
  { description: string; def: { type: 'function'; function: { name: string; description: string; parameters: any } } }
>();

export abstract class BaseTool<TInput = any, TOutput = any> {
  abstract name: string;
  abstract description: string;
  abstract schema: z.ZodType<TInput, z.ZodTypeDef, any>;

  /** Whether this tool requires human approval before execution. */
  requiresApproval: boolean = false;

  /** Risk level for tiered approval: low → auto-approve in standard mode, medium/high → require approval. */
  riskLevel: ToolRiskLevel = 'medium';

  /** Whether this tool can be invoked via ToolContext.callTool() chaining. */
  chainable: boolean = true;

  /**
   * Safety configuration — override in subclasses to customize.
   * - timeout: max execution time in ms (default 120s)
   * - retryCount: automatic retries on failure (default 0)
   * - maxResultSize: result truncation threshold in chars (default 25000)
   */
  safety: ToolSafetyConfig = { ...DEFAULT_TOOL_SAFETY };

  /** Cached function definition — avoids repeated zodToJsonSchema conversion (#15). */
  private _cachedFunctionDef?: { type: 'function'; function: { name: string; description: string; parameters: any } };

  async execute(input: TInput, ctx?: ToolContext): Promise<ToolExecutionResult> {
    const { retryCount, timeout, maxResultSize } = this.safety;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const validatedInput = this.schema.parse(input);

        // Execute with timeout protection
        const runPromise = this._run(validatedInput, ctx);
        const result = timeout > 0 && timeout < Infinity
          ? await withTimeout(runPromise, timeout, this.name)
          : await runPromise;

        // Truncate oversized results
        return { success: true, data: truncateResult(result, maxResultSize) };
      } catch (error: any) {
        if (attempt < retryCount) {
          console.warn(`[Tool:${this.name}] Attempt ${attempt + 1}/${retryCount + 1} failed, retrying: ${error.message}`);
          continue;
        }
        console.error(`[Tool:${this.name}] Error:`, error);
        return { success: false, error: error.message || String(error) };
      }
    }

    // Unreachable, but TypeScript needs this
    return { success: false, error: 'Unexpected: all retry attempts exhausted.' };
  }

  protected abstract _run(input: TInput, ctx?: ToolContext): Promise<TOutput>;

  /**
   * Convert to OpenAI function-calling tool definition.
   *
   * Three-level memoization:
   * 1. Instance-level `_cachedFunctionDef` — fastest, same object reference.
   * 2. Module-level `_globalFunctionDefCache` — shared across instances with
   *    the same tool name + description (avoids zodToJsonSchema on re-creation).
   * 3. Fallback: run zodToJsonSchema and populate both caches.
   */
  toFunctionDef(): { type: 'function'; function: { name: string; description: string; parameters: any } } {
    // Level 1: instance cache
    if (this._cachedFunctionDef) return this._cachedFunctionDef;

    // Level 2: global cache (description must match to handle selectDesc switching)
    const globalEntry = _globalFunctionDefCache.get(this.name);
    if (globalEntry && globalEntry.description === this.description) {
      this._cachedFunctionDef = globalEntry.def;
      return globalEntry.def;
    }

    // Level 3: compute from scratch
    const jsonSchema = zodToJsonSchema(this.schema, { target: 'openApi3' });
    // Remove $schema and top-level metadata that OpenAI doesn't need
    const { $schema, ...parameters } = jsonSchema as any;
    const def = {
      type: 'function' as const,
      function: {
        name: this.name,
        description: this.description,
        parameters,
      },
    };

    // Write to both caches
    this._cachedFunctionDef = def;
    _globalFunctionDefCache.set(this.name, { description: this.description, def });

    return def;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout. Rejects with a descriptive error if
 * the promise does not resolve within `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, toolName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tool "${toolName}" timed out after ${ms}ms.`)),
      ms,
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Truncate a tool result if it exceeds maxSize characters.
 * Strings are truncated directly; objects are JSON-stringified first.
 */
function truncateResult<T>(data: T, maxSize: number): T {
  if (maxSize <= 0) return data;

  if (typeof data === 'string' && data.length > maxSize) {
    return (data.slice(0, maxSize) +
      `\n...[Truncated: ${data.length} total chars, showing first ${maxSize}]`) as unknown as T;
  }

  if (typeof data === 'object' && data !== null) {
    const str = JSON.stringify(data);
    if (str.length > maxSize) {
      return (str.slice(0, maxSize) +
        `\n...[Truncated]`) as unknown as T;
    }
  }

  return data;
}
