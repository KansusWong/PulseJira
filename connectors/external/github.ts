/**
 * GitHub external connector — creates PRs and manages repos via GitHub API.
 *
 * Requires: GITHUB_TOKEN env var.
 */

const API_BASE = 'https://api.github.com';

function authHeaders(): Record<string, string> | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'RebuilD/1.0',
  };
}

export interface CreatePROptions {
  owner: string;
  repo: string;
  head: string;
  base: string;
  title: string;
  body: string;
  draft?: boolean;
}

export interface PRResult {
  url: string;
  number: number;
  html_url: string;
}

/**
 * Create a pull request on GitHub.
 */
export async function createPullRequest(options: CreatePROptions): Promise<PRResult | null> {
  const headers = authHeaders();
  if (!headers) return null;

  const { owner, repo, head, base, title, body, draft = false } = options;

  try {
    const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ head, base, title, body, draft }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[github] Failed to create PR: ${res.status}`, err);
      return null;
    }

    const data = await res.json();
    return {
      url: data.url,
      number: data.number,
      html_url: data.html_url,
    };
  } catch (error: any) {
    console.error('[github] createPullRequest failed:', error.message);
    return null;
  }
}

/**
 * Get the default branch name of a repository.
 */
export async function getDefaultBranch(owner: string, repo: string): Promise<string | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.default_branch || 'main';
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PR lifecycle — merge, status checks
// ---------------------------------------------------------------------------

export type PRMergeMethod = 'merge' | 'squash' | 'rebase';

/**
 * Merge an existing pull request.
 */
export async function mergePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  options: { method?: PRMergeMethod; commitTitle?: string } = {}
): Promise<{ merged: boolean; sha: string | null; message: string }> {
  const headers = authHeaders();
  if (!headers) return { merged: false, sha: null, message: 'GITHUB_TOKEN not set' };

  try {
    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merge_method: options.method || 'squash',
          commit_title: options.commitTitle,
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    const data = await res.json();
    return { merged: res.ok && data.merged, sha: data.sha || null, message: data.message || '' };
  } catch (error: any) {
    return { merged: false, sha: null, message: error.message };
  }
}

export interface CICheckStatus {
  state: 'success' | 'failure' | 'pending' | 'error';
  total: number;
  passed: number;
  failed: number;
  pending: number;
  checks: { name: string; status: string; conclusion: string | null }[];
}

/**
 * Get combined CI check status for a PR's head commit.
 */
export async function getPRChecks(
  owner: string,
  repo: string,
  ref: string
): Promise<CICheckStatus> {
  const headers = authHeaders();
  const fallback: CICheckStatus = {
    state: 'pending', total: 0, passed: 0, failed: 0, pending: 0, checks: [],
  };
  if (!headers) return fallback;

  try {
    // Use check-runs API (GitHub Actions + third-party CI)
    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/commits/${ref}/check-runs`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );

    if (!res.ok) return fallback;
    const data = await res.json();
    const runs: any[] = data.check_runs || [];

    const checks = runs.map((r: any) => ({
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
    }));

    const passed = checks.filter((c) => c.conclusion === 'success').length;
    const failed = checks.filter((c) => c.conclusion === 'failure' || c.conclusion === 'cancelled').length;
    const pending = checks.filter((c) => c.status !== 'completed').length;

    let state: CICheckStatus['state'] = 'pending';
    if (pending === 0 && failed === 0) state = 'success';
    else if (failed > 0) state = 'failure';

    return { state, total: checks.length, passed, failed, pending, checks };
  } catch {
    return fallback;
  }
}

/**
 * Get PR details including head SHA, mergeable state.
 */
export async function getPRDetails(
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ headSha: string; mergeable: boolean | null; state: string } | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return {
      headSha: data.head?.sha || '',
      mergeable: data.mergeable,
      state: data.state,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GitHub Actions — trigger and monitor workflows
// ---------------------------------------------------------------------------

/**
 * Trigger a GitHub Actions workflow dispatch event.
 */
export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowId: string | number,
  ref: string,
  inputs: Record<string, string> = {}
): Promise<boolean> {
  const headers = authHeaders();
  if (!headers) return false;

  try {
    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, inputs }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    return res.status === 204;
  } catch {
    return false;
  }
}

export interface WorkflowRunStatus {
  id: number;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  html_url: string;
}

/**
 * Get the latest workflow run for a branch.
 */
export async function getLatestWorkflowRun(
  owner: string,
  repo: string,
  branch: string,
  workflowId?: string | number
): Promise<WorkflowRunStatus | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const base = workflowId
      ? `${API_BASE}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`
      : `${API_BASE}/repos/${owner}/${repo}/actions/runs`;

    const params = new URLSearchParams({ branch, per_page: '1' });
    const res = await fetch(`${base}?${params}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const run = data.workflow_runs?.[0];
    if (!run) return null;

    return {
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GitHub Deployments API
// ---------------------------------------------------------------------------

export interface DeploymentStatus {
  id: number;
  state: 'pending' | 'success' | 'failure' | 'error' | 'inactive' | 'in_progress' | 'queued';
  environment: string;
  environment_url: string | null;
  description: string;
}

/**
 * Get the latest deployment for a ref/environment.
 */
export async function getLatestDeployment(
  owner: string,
  repo: string,
  options: { ref?: string; environment?: string } = {}
): Promise<DeploymentStatus | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const params = new URLSearchParams({ per_page: '1' });
    if (options.ref) params.set('ref', options.ref);
    if (options.environment) params.set('environment', options.environment);

    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/deployments?${params}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) return null;
    const deployments = await res.json();
    const dep = deployments[0];
    if (!dep) return null;

    // Get the latest status for this deployment
    const statusRes = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/deployments/${dep.id}/statuses?per_page=1`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );

    const statuses = statusRes.ok ? await statusRes.json() : [];
    const latest = statuses[0];

    return {
      id: dep.id,
      state: latest?.state || 'pending',
      environment: dep.environment,
      environment_url: latest?.environment_url || null,
      description: latest?.description || '',
    };
  } catch {
    return null;
  }
}

export function isGitHubAvailable(): boolean {
  return !!process.env.GITHUB_TOKEN;
}
