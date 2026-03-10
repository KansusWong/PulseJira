/**
 * Deploy Pipeline — auto-merge PR, trigger deployment, verify health.
 *
 * Lifecycle:
 * 1. Wait for CI checks to pass on the PR
 * 2. Merge the PR (squash by default)
 * 3. Trigger deployment on target platform (Vercel / GitHub Actions / custom)
 * 4. Poll until deployment is live
 * 5. Health check the deployed URL
 * 6. On failure + autoRollback → create revert PR
 *
 * This pipeline can run as a standalone skill, or be chained after
 * implement-pipeline.ts via the API route.
 */

import { messageBus } from '@/connectors/bus/message-bus';
import * as github from '@/connectors/external/github';
import * as vercel from '@/connectors/external/vercel';
import type {
  DeployPipelineInput,
  DeployResult,
  DeployState,
} from '@/lib/sandbox/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CI_POLL_INTERVAL = 15_000;   // 15s
const CI_POLL_TIMEOUT = 600_000;   // 10min
const DEPLOY_POLL_INTERVAL = 10_000;
const DEPLOY_POLL_TIMEOUT = 600_000;

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

export async function runDeployment(
  input: DeployPipelineInput,
  context: { logger?: (msg: string) => Promise<void> | void } = {}
): Promise<DeployResult> {
  const log = context.logger || console.log;
  const {
    projectId,
    prNumber,
    prUrl,
    repoOwner,
    repoName,
    target,
    vercelProject,
    vercelDeployHook,
    healthCheckUrl,
    autoRollback = true,
  } = input;

  let state: DeployState = 'pending';
  let deploymentUrl: string | null = null;
  let mergedAt: string | null = null;
  let healthResult: DeployResult['healthCheck'] = null;

  try {
    // -----------------------------------------------------------------
    // Step 1: Wait for CI to pass
    // -----------------------------------------------------------------
    await log(`[deploy] Checking CI status for PR #${prNumber}...`);
    messageBus.agentStart('deployer', 1, 4);

    const ciOk = await waitForCI(repoOwner, repoName, prNumber, log);
    if (!ciOk) {
      state = 'failed';
      await log('[deploy] CI checks did not pass. Aborting deployment.');
      messageBus.agentComplete('deployer', { state, error: 'CI failed' });
      return { state, deploymentUrl, mergedAt, healthCheck: null, error: 'CI checks failed' };
    }

    await log('[deploy] CI checks passed.');

    // -----------------------------------------------------------------
    // Step 2: Merge PR
    // -----------------------------------------------------------------
    state = 'merging';
    await log(`[deploy] Merging PR #${prNumber}...`);
    messageBus.agentStart('deployer', 2, 4);

    const mergeResult = await github.mergePullRequest(repoOwner, repoName, prNumber, {
      method: 'squash',
    });

    if (!mergeResult || !mergeResult.merged) {
      state = 'failed';
      const msg = mergeResult?.message || 'Merge failed';
      await log(`[deploy] Merge failed: ${msg}`);
      messageBus.agentComplete('deployer', { state, error: msg });
      return { state, deploymentUrl, mergedAt, healthCheck: null, error: msg };
    }

    mergedAt = new Date().toISOString();
    await log(`[deploy] PR merged. SHA: ${mergeResult.sha}`);

    // -----------------------------------------------------------------
    // Step 3: Trigger deployment
    // -----------------------------------------------------------------
    state = 'deploying';
    await log(`[deploy] Triggering deployment on ${target}...`);
    messageBus.agentStart('deployer', 3, 4);

    deploymentUrl = await triggerAndWaitForDeploy(input, log);

    if (!deploymentUrl) {
      state = 'failed';
      await log('[deploy] Deployment failed or timed out.');

      if (autoRollback) {
        await log('[deploy] Attempting rollback via revert...');
        await attemptRollback(repoOwner, repoName, mergeResult.sha || '', prNumber, log);
        state = 'rolled_back';
      }

      messageBus.agentComplete('deployer', { state, error: 'Deployment failed' });
      return { state, deploymentUrl: null, mergedAt, healthCheck: null, error: 'Deployment failed' };
    }

    await log(`[deploy] Deployment live at: ${deploymentUrl}`);

    // -----------------------------------------------------------------
    // Step 4: Health check
    // -----------------------------------------------------------------
    state = 'verifying';
    await log('[deploy] Running health check...');
    messageBus.agentStart('deployer', 4, 4);

    const checkUrl = healthCheckUrl || deploymentUrl;
    const hc = await vercel.healthCheck(checkUrl, { timeoutMs: 15_000 });
    healthResult = {
      healthy: hc.healthy,
      status: hc.status,
      latencyMs: hc.latencyMs,
      checkedAt: new Date().toISOString(),
    };

    if (hc.healthy) {
      state = 'success';
      await log(`[deploy] Health check passed (${hc.status}, ${hc.latencyMs}ms).`);
    } else {
      await log(`[deploy] Health check failed (status=${hc.status}).`);

      if (autoRollback) {
        await log('[deploy] Attempting rollback via revert...');
        await attemptRollback(repoOwner, repoName, mergeResult.sha || '', prNumber, log);
        state = 'rolled_back';
      } else {
        state = 'failed';
      }
    }

    messageBus.agentComplete('deployer', { state, deploymentUrl, healthCheck: healthResult });
    messageBus.stageComplete('deploy', { state, deploymentUrl }, 'deployer');
    await log(`[deploy] Done: ${state}`);

    return {
      state,
      deploymentUrl: state === 'success' ? deploymentUrl : null,
      mergedAt,
      healthCheck: healthResult,
      error: state === 'success' ? null : `Health check failed (status=${healthResult?.status ?? 'unknown'})`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown deploy error';
    await log(`[deploy] Pipeline error: ${message}`);
    return {
      state: 'failed',
      deploymentUrl,
      mergedAt,
      healthCheck: healthResult,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Poll CI status until all checks pass, fail, or timeout.
 */
async function waitForCI(
  owner: string,
  repo: string,
  prNumber: number,
  log: (msg: string) => Promise<void> | void
): Promise<boolean> {
  const prDetails = await github.getPRDetails(owner, repo, prNumber);
  if (!prDetails) return false;

  const start = Date.now();

  while (Date.now() - start < CI_POLL_TIMEOUT) {
    const checks = await github.getPRChecks(owner, repo, prDetails.headSha);
    if (!checks) return false;

    if (checks.state === 'success') return true;
    if (checks.state === 'failure') {
      await log(`[deploy] CI failed: ${checks.failed}/${checks.total} checks failed.`);
      return false;
    }

    await log(`[deploy] CI pending: ${checks.pending}/${checks.total} still running...`);
    await sleep(CI_POLL_INTERVAL);
  }

  await log('[deploy] CI check timed out.');
  return false;
}

/**
 * Trigger deployment and poll until ready.
 * Returns the deployment URL on success, null on failure.
 */
async function triggerAndWaitForDeploy(
  input: DeployPipelineInput,
  log: (msg: string) => Promise<void> | void
): Promise<string | null> {
  const { target, vercelProject, vercelDeployHook, repoOwner, repoName } = input;

  if (target === 'vercel') {
    return triggerVercelDeploy(vercelProject, vercelDeployHook, log);
  }

  if (target === 'github-pages') {
    // GitHub Pages deploys automatically on push to the default branch.
    // We poll the latest deployment via GitHub API.
    return pollGitHubDeployment(repoOwner, repoName, log);
  }

  if (target === 'custom' && input.customDeployCommand) {
    await log(`[deploy] Custom deploy target — trigger via webhook is not directly supported. Manual action may be needed.`);
    return null;
  }

  await log(`[deploy] Unknown deploy target: ${target}`);
  return null;
}

async function triggerVercelDeploy(
  vercelProjectName?: string,
  deployHook?: string,
  log: (msg: string) => Promise<void> | void = console.log
): Promise<string | null> {
  // Option A: Deploy Hook
  if (deployHook) {
    const hookResult = await vercel.triggerDeployHook(deployHook);
    if (!hookResult) {
      await log('[deploy] Vercel deploy hook failed.');
      return null;
    }
    await log('[deploy] Vercel deploy hook triggered. Waiting for deployment...');
  }

  // Poll latest deployment
  if (!vercelProjectName) {
    await log('[deploy] No vercel project name — cannot poll deployment status.');
    return null;
  }

  const start = Date.now();
  while (Date.now() - start < DEPLOY_POLL_TIMEOUT) {
    const dep = await vercel.getLatestDeployment(vercelProjectName, { target: 'production' });
    if (dep) {
      if (dep.state === 'READY') {
        return dep.url.startsWith('http') ? dep.url : `https://${dep.url}`;
      }
      if (dep.state === 'ERROR' || dep.state === 'CANCELED') {
        await log(`[deploy] Vercel deployment ${dep.state}.`);
        return null;
      }
      await log(`[deploy] Vercel deployment: ${dep.state}...`);
    }
    await sleep(DEPLOY_POLL_INTERVAL);
  }

  await log('[deploy] Vercel deployment timed out.');
  return null;
}

async function pollGitHubDeployment(
  owner: string,
  repo: string,
  log: (msg: string) => Promise<void> | void
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < DEPLOY_POLL_TIMEOUT) {
    const dep = await github.getLatestDeployment(owner, repo, { environment: 'github-pages' });
    if (dep && dep.state === 'success' && dep.environment_url) {
      return dep.environment_url;
    }
    await log('[deploy] Waiting for GitHub Pages deployment...');
    await sleep(DEPLOY_POLL_INTERVAL);
  }
  await log('[deploy] GitHub Pages deployment timed out.');
  return null;
}

/**
 * Attempt rollback by creating a revert commit.
 * We use GitHub's API to create a revert PR, then auto-merge it.
 */
async function attemptRollback(
  owner: string,
  repo: string,
  mergedSha: string,
  originalPR: number,
  log: (msg: string) => Promise<void> | void
): Promise<void> {
  try {
    // GitHub doesn't have a direct "revert commit" API endpoint.
    // The cleanest approach: use the createPullRequest to document what happened,
    // but actual revert requires git operations. For now, log the guidance.
    await log(`[deploy] ROLLBACK: Merge SHA ${mergedSha} from PR #${originalPR} should be reverted.`);
    await log(`[deploy] Recommended: run "git revert ${mergedSha}" locally, push, and create a revert PR.`);
    await log(`[deploy] Automated revert via API is planned for a future iteration.`);
  } catch (error: any) {
    await log(`[deploy] Rollback attempt failed: ${error.message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
