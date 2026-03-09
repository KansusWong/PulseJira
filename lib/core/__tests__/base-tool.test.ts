import { z } from 'zod';
import { BaseTool } from '../base-tool';

// Concrete implementation for testing
class EchoTool extends BaseTool<{ message: string }, string> {
  name = 'echo';
  description = 'Echoes back the message';
  schema = z.object({ message: z.string() });

  protected async _run(input: { message: string }): Promise<string> {
    return `Echo: ${input.message}`;
  }
}

class FailTool extends BaseTool<{ value: number }, number> {
  name = 'fail';
  description = 'Always fails';
  schema = z.object({ value: z.number() });

  protected async _run(): Promise<number> {
    throw new Error('intentional failure');
  }
}

// ---------------------------------------------------------------------------
// BaseTool.execute
// ---------------------------------------------------------------------------
describe('BaseTool.execute', () => {
  it('returns success with data on valid input', async () => {
    const tool = new EchoTool();
    const result = await tool.execute({ message: 'hello' });
    expect(result).toEqual({ success: true, data: 'Echo: hello' });
  });

  it('returns error on schema validation failure', async () => {
    const tool = new EchoTool();
    // Pass invalid input — number instead of string
    const result = await tool.execute({ message: 123 as any });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it('returns error when _run throws', async () => {
    const tool = new FailTool();
    const result = await tool.execute({ value: 42 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('intentional failure');
    }
  });
});

// ---------------------------------------------------------------------------
// BaseTool.toFunctionDef
// ---------------------------------------------------------------------------
describe('BaseTool.toFunctionDef', () => {
  it('returns valid OpenAI function definition', () => {
    const tool = new EchoTool();
    const def = tool.toFunctionDef();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('echo');
    expect(def.function.description).toBe('Echoes back the message');
    expect(def.function.parameters).toBeDefined();
    // Should include the schema properties
    expect(def.function.parameters.properties).toHaveProperty('message');
  });

  it('caches the result (returns same reference)', () => {
    const tool = new EchoTool();
    const first = tool.toFunctionDef();
    const second = tool.toFunctionDef();
    expect(first).toBe(second); // strict reference equality
  });
});
