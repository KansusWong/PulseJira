import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { SupervisorVerdict, SupervisorIssue } from '../core/types';

const ValidateOutputInputSchema = z.object({
  step_id: z.string().describe('Unique identifier for the step being validated'),
  step_description: z.string().describe('What the step was supposed to accomplish'),
  expected_output: z.string().describe('Description of what correct output should look like'),
  actual_output: z.string().describe('The actual output to validate (stringified JSON or text)'),
  context: z.string().optional().describe('Additional context (e.g., original requirements)'),
});

type ValidateOutputInput = z.infer<typeof ValidateOutputInputSchema>;

/**
 * Lightweight programmatic validation tool.
 * Performs structural checks (JSON validity, required fields, length).
 * For deep LLM-based validation, the Architect should spawn the Supervisor agent instead.
 */
export class ValidateOutputTool extends BaseTool<ValidateOutputInput, SupervisorVerdict> {
  name = 'validate_output';
  description = '对 Agent 产出进行轻量级程序化验证（JSON 格式、字段完整性、长度等）。返回 pass/fail/warn 裁定。如需深度语义验证，请改用 spawn_agent("supervisor")。';
  schema = ValidateOutputInputSchema;

  protected async _run(input: ValidateOutputInput): Promise<SupervisorVerdict> {
    const issues: SupervisorIssue[] = [];

    // 1. Check if output is empty
    if (!input.actual_output || input.actual_output.trim().length === 0) {
      issues.push({
        severity: 'error',
        category: 'completeness',
        message: 'Output is empty.',
      });
      return { verdict: 'fail', confidence: 1.0, issues, suggestion: 'Agent produced no output. Retry with clearer instructions.', should_retry: true };
    }

    // 2. Try to parse as JSON to check structure
    let parsed: any = null;
    try {
      parsed = JSON.parse(input.actual_output);
    } catch {
      // Not JSON — may be plain text, which is acceptable for some agents
      issues.push({
        severity: 'info',
        category: 'quality',
        message: 'Output is not valid JSON (may be acceptable for text-based agents).',
      });
    }

    // 3. Check for error indicators
    if (parsed && typeof parsed === 'object') {
      if (parsed.error) {
        issues.push({
          severity: 'error',
          category: 'correctness',
          message: `Output contains an error: ${parsed.error}`,
        });
      }
      if (parsed.status === 'failed' || parsed.status === 'error') {
        issues.push({
          severity: 'error',
          category: 'correctness',
          message: `Output status indicates failure: ${parsed.status}`,
        });
      }
    }

    // 4. Check minimum length (heuristic)
    if (input.actual_output.length < 20) {
      issues.push({
        severity: 'warning',
        category: 'completeness',
        message: `Output is suspiciously short (${input.actual_output.length} chars).`,
      });
    }

    // 5. Determine verdict
    const hasErrors = issues.some((i) => i.severity === 'error');
    const hasWarnings = issues.some((i) => i.severity === 'warning');

    if (hasErrors) {
      return {
        verdict: 'fail',
        confidence: 0.8,
        issues,
        suggestion: 'Fix the errors identified above and retry.',
        should_retry: true,
      };
    }

    if (hasWarnings) {
      return {
        verdict: 'warn',
        confidence: 0.7,
        issues,
        should_retry: false,
      };
    }

    return {
      verdict: 'pass',
      confidence: 0.9,
      issues,
      should_retry: false,
    };
  }
}
