/**
 * TriggerDeployTool — triggers a deployment via Vercel, GitHub Actions, or custom hook.
 *
 * Supports multiple deployment targets.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  target: z.enum(['vercel', 'github-actions', 'custom']).describe('Deployment target platform'),
  // Vercel
  vercel_project: z.string().optional().describe('Vercel project name (for Vercel target)'),
  vercel_deploy_hook: z.string().optional().describe('Vercel deploy hook URL (alternative to project)'),
  deploy_ref: z.string().optional().describe('Git ref to deploy (branch name)'),
  // GitHub Actions
  owner: z.string().optional().describe('Repo owner (for GitHub Actions target)'),
  repo: z.string().optional().describe('Repo name (for GitHub Actions target)'),
  workflow_id: z.string().optional().describe('Workflow ID or filename (for GitHub Actions target)'),
  // Custom
  custom_hook_url: z.string().optional().describe('Custom deploy webhook URL'),
});

type Input = z.infer<typeof schema>;

interface DeployTriggerResult {
  triggered: boolean;
  deploymentId?: string;
  message: string;
}

export class TriggerDeployTool extends BaseTool<Input, DeployTriggerResult> {
  name = 'trigger_deploy';
  description = 'Trigger a deployment on the specified platform (Vercel, GitHub Actions, or custom webhook).';
  schema = schema;
  requiresApproval = true;

  protected async _run(input: Input): Promise<DeployTriggerResult> {
    switch (input.target) {
      case 'vercel':
        return this.triggerVercel(input);
      case 'github-actions':
        return this.triggerGitHubActions(input);
      case 'custom':
        return this.triggerCustom(input);
      default:
        return { triggered: false, message: `Unknown target: ${input.target}` };
    }
  }

  private async triggerVercel(input: Input): Promise<DeployTriggerResult> {
    if (input.vercel_deploy_hook) {
      const { triggerDeployHook } = await import('@/connectors/external/vercel');
      const result = await triggerDeployHook(input.vercel_deploy_hook);
      if (result) {
        return { triggered: true, deploymentId: result.job, message: 'Vercel deploy hook triggered' };
      }
      return { triggered: false, message: 'Vercel deploy hook failed' };
    }

    if (input.vercel_project && input.deploy_ref) {
      const { createDeployment } = await import('@/connectors/external/vercel');
      const dep = await createDeployment(input.vercel_project, {
        ref: input.deploy_ref,
        target: 'production',
      });
      if (dep) {
        return { triggered: true, deploymentId: dep.id, message: `Vercel deployment created: ${dep.url}` };
      }
      return { triggered: false, message: 'Vercel deployment creation failed' };
    }

    return { triggered: false, message: 'vercel_deploy_hook or (vercel_project + deploy_ref) required' };
  }

  private async triggerGitHubActions(input: Input): Promise<DeployTriggerResult> {
    if (!input.owner || !input.repo || !input.workflow_id || !input.deploy_ref) {
      return { triggered: false, message: 'owner, repo, workflow_id, and deploy_ref are required for GitHub Actions' };
    }

    const { triggerWorkflow } = await import('@/connectors/external/github');
    const ok = await triggerWorkflow(input.owner, input.repo, input.workflow_id, input.deploy_ref);
    return {
      triggered: ok,
      message: ok ? 'GitHub Actions workflow dispatched' : 'Failed to dispatch workflow',
    };
  }

  private async triggerCustom(input: Input): Promise<DeployTriggerResult> {
    if (!input.custom_hook_url) {
      return { triggered: false, message: 'custom_hook_url is required' };
    }

    try {
      const res = await fetch(input.custom_hook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: input.deploy_ref }),
        signal: AbortSignal.timeout(15_000),
      });
      return {
        triggered: res.ok,
        message: res.ok ? `Custom deploy triggered (${res.status})` : `Custom deploy failed (${res.status})`,
      };
    } catch (error: any) {
      return { triggered: false, message: `Custom deploy error: ${error.message}` };
    }
  }
}
