/**
 * Vercel external connector — trigger deployments and check status via Vercel API.
 *
 * Requires: VERCEL_TOKEN env var.
 * Optional: VERCEL_TEAM_ID for team-scoped projects.
 */

const API_BASE = 'https://api.vercel.com';

function authHeaders(): Record<string, string> | null {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function teamParam(): string {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `teamId=${teamId}` : '';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VercelDeployment {
  id: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  readyState: string;
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  inspectorUrl: string;
  meta?: Record<string, string>;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  latestDeployments?: VercelDeployment[];
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

/**
 * Trigger a new deployment via Vercel Deploy Hook.
 * Deploy hooks are project-specific URLs in the form:
 *   https://api.vercel.com/v1/integrations/deploy/prj_xxx/hook_yyy
 */
export async function triggerDeployHook(hookUrl: string): Promise<{ job: string } | null> {
  try {
    const res = await fetch(hookUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[vercel] Deploy hook failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return { job: data.job?.id || data.id || 'triggered' };
  } catch (error: any) {
    console.error('[vercel] triggerDeployHook failed:', error.message);
    return null;
  }
}

/**
 * Get the latest deployment for a project.
 */
export async function getLatestDeployment(
  projectId: string,
  options: { target?: 'production' | 'preview'; limit?: number } = {}
): Promise<VercelDeployment | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const params = new URLSearchParams({
      projectId,
      limit: String(options.limit || 1),
      ...(options.target && { target: options.target }),
    });

    const team = teamParam();
    const sep = team ? '&' : '';
    const res = await fetch(
      `${API_BASE}/v6/deployments?${params}${sep}${team}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const dep = data.deployments?.[0];
    if (!dep) return null;

    return {
      id: dep.uid || dep.id,
      url: dep.url,
      state: dep.state || dep.readyState,
      readyState: dep.readyState,
      createdAt: dep.createdAt || dep.created,
      buildingAt: dep.buildingAt,
      ready: dep.ready,
      inspectorUrl: dep.inspectorUrl || '',
    };
  } catch {
    return null;
  }
}

/**
 * Get deployment by ID.
 */
export async function getDeployment(deploymentId: string): Promise<VercelDeployment | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const team = teamParam();
    const sep = team ? '?' : '';
    const res = await fetch(
      `${API_BASE}/v13/deployments/${deploymentId}${sep}${team}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) return null;
    const data = await res.json();

    return {
      id: data.id,
      url: data.url,
      state: data.readyState,
      readyState: data.readyState,
      createdAt: data.createdAt || data.created,
      buildingAt: data.buildingAt,
      ready: data.ready,
      inspectorUrl: data.inspectorUrl || '',
      meta: data.meta,
    };
  } catch {
    return null;
  }
}

/**
 * Poll deployment until it reaches a terminal state (READY, ERROR, CANCELED).
 * Returns the final deployment state.
 */
export async function waitForDeployment(
  deploymentId: string,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<VercelDeployment | null> {
  const pollInterval = options.pollIntervalMs || 10_000;
  const timeout = options.timeoutMs || 600_000; // 10 min default
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const dep = await getDeployment(deploymentId);
    if (!dep) return null;

    if (dep.state === 'READY' || dep.state === 'ERROR' || dep.state === 'CANCELED') {
      return dep;
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  // Timeout — return last known state
  return getDeployment(deploymentId);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Get Vercel project info.
 */
export async function getProject(projectNameOrId: string): Promise<VercelProject | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const team = teamParam();
    const sep = team ? '?' : '';
    const res = await fetch(
      `${API_BASE}/v9/projects/${projectNameOrId}${sep}${team}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) return null;
    const data = await res.json();

    return {
      id: data.id,
      name: data.name,
      framework: data.framework || null,
    };
  } catch {
    return null;
  }
}

/**
 * Create a new deployment for a git ref (requires Vercel Git integration).
 * This uses the Vercel API to create a deployment from a specific git ref.
 */
export async function createDeployment(
  projectName: string,
  options: {
    ref: string;
    target?: 'production' | 'preview';
  }
): Promise<VercelDeployment | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const team = teamParam();
    const sep = team ? '?' : '';
    const res = await fetch(
      `${API_BASE}/v13/deployments${sep}${team}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: projectName,
          target: options.target || 'preview',
          gitSource: {
            ref: options.ref,
            type: 'branch',
          },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`[vercel] createDeployment failed: ${res.status}`, err);
      return null;
    }

    const data = await res.json();
    return {
      id: data.id,
      url: data.url,
      state: data.readyState || 'INITIALIZING',
      readyState: data.readyState || 'INITIALIZING',
      createdAt: data.createdAt || Date.now(),
      inspectorUrl: data.inspectorUrl || '',
    };
  } catch (error: any) {
    console.error('[vercel] createDeployment failed:', error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Simple HTTP health check on a deployed URL.
 * Returns true if the URL responds with 2xx within the timeout.
 */
export async function healthCheck(
  url: string,
  options: { timeoutMs?: number; expectedStatus?: number } = {}
): Promise<{ healthy: boolean; status: number; latencyMs: number }> {
  const timeout = options.timeoutMs || 10_000;
  const start = Date.now();

  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(fullUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
    });

    const latencyMs = Date.now() - start;
    const expectedStatus = options.expectedStatus || 200;
    const healthy = options.expectedStatus
      ? res.status === expectedStatus
      : res.status >= 200 && res.status < 400;

    return { healthy, status: res.status, latencyMs };
  } catch {
    return { healthy: false, status: 0, latencyMs: Date.now() - start };
  }
}

export function isVercelAvailable(): boolean {
  return !!process.env.VERCEL_TOKEN;
}
