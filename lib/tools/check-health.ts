/**
 * CheckHealthTool — performs HTTP health check on a deployed URL.
 *
 * Returns whether the URL responds with a 2xx status and the latency.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  url: z.string().describe('URL to check (will prepend https:// if missing)'),
  timeout_ms: z.number().optional().describe('Timeout in milliseconds (default: 10000)'),
  expected_status: z.number().optional().describe('Expected HTTP status code (default: any 2xx/3xx)'),
});

type Input = z.infer<typeof schema>;

interface HealthResult {
  healthy: boolean;
  status: number;
  latencyMs: number;
  url: string;
}

export class CheckHealthTool extends BaseTool<Input, HealthResult> {
  name = 'check_health';
  description = 'Perform an HTTP health check on a URL. Returns healthy status and response latency.';
  schema = schema;

  protected async _run(input: Input): Promise<HealthResult> {
    const { healthCheck } = await import('@/connectors/external/vercel');
    const result = await healthCheck(input.url, {
      timeoutMs: input.timeout_ms,
      expectedStatus: input.expected_status,
    });
    return { ...result, url: input.url };
  }
}
