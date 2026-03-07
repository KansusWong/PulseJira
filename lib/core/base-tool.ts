import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolExecutionResult } from './types';

export abstract class BaseTool<TInput = any, TOutput = any> {
  abstract name: string;
  abstract description: string;
  abstract schema: z.ZodType<TInput, z.ZodTypeDef, any>;

  /** Whether this tool requires human approval before execution. */
  requiresApproval: boolean = false;

  /** Cached function definition — avoids repeated zodToJsonSchema conversion (#15). */
  private _cachedFunctionDef?: { type: 'function'; function: { name: string; description: string; parameters: any } };

  async execute(input: TInput): Promise<ToolExecutionResult> {
    try {
      const validatedInput = this.schema.parse(input);
      const result = await this._run(validatedInput);
      return { success: true, data: result };
    } catch (error: any) {
      console.error(`[Tool:${this.name}] Error:`, error);
      return { success: false, error: error.message || String(error) };
    }
  }

  protected abstract _run(input: TInput): Promise<TOutput>;

  /**
   * Convert to OpenAI function-calling tool definition.
   * Result is memoized — zodToJsonSchema runs only once per tool instance.
   */
  toFunctionDef(): { type: 'function'; function: { name: string; description: string; parameters: any } } {
    if (this._cachedFunctionDef) return this._cachedFunctionDef;

    const jsonSchema = zodToJsonSchema(this.schema, { target: 'openApi3' });
    // Remove $schema and top-level metadata that OpenAI doesn't need
    const { $schema, ...parameters } = jsonSchema as any;
    this._cachedFunctionDef = {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters,
      },
    };
    return this._cachedFunctionDef;
  }
}
