/**
 * Next.js Edge Middleware — API authentication & RBAC.
 *
 * Flow:
 * 1. AUTH_ENABLED !== 'true' → pass through with x-auth-role: admin
 * 2. Public paths → pass through
 * 3. Cron paths → validate CRON_SECRET bearer token
 * 4. Extract Bearer key → SHA-256 hash → lookup in api_keys table
 * 5. Validate: exists, is_active, not expired
 * 6. Check role against route permission map
 * 7. Inject headers and fire-and-forget audit
 *
 * Uses Web Crypto API for Edge runtime compatibility.
 * Uses lightweight Supabase REST calls (no heavy client in Edge).
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from 'next-auth/jwt';

// ── Constants (inlined to avoid importing from lib/ in Edge) ─────────────
const PUBLIC_PATHS = ["/api/health", "/api/auth/bootstrap", "/api/auth/register", "/login", "/no-organization"];
const CRON_PATH_PREFIX = "/api/cron/";
const ROLE_HIERARCHY = ["viewer", "developer", "admin"];
const KEY_CACHE_TTL_MS = 60_000;
const REDACTED_BODY_PATHS = ["/api/settings/env", "/api/auth/keys", "/api/auth/bootstrap"];
const AUDIT_BODY_MAX_LENGTH = 1_000;

// ── Route permissions (inlined for Edge — mirrors lib/auth/route-permissions.ts) ──
// SYNC: This rule table MUST be kept in sync with lib/auth/route-permissions.ts
interface RouteRule {
  pattern: string;
  method: string;
  permission: string;
}

const ROUTE_PERMISSIONS: RouteRule[] = [
  { pattern: "/api/health", method: "*", permission: "public" },
  { pattern: "/api/cron/**", method: "*", permission: "public" },
  { pattern: "/api/auth/**", method: "*", permission: "admin" },
  { pattern: "/api/settings/env", method: "PUT", permission: "admin" },
  { pattern: "/api/settings/env", method: "POST", permission: "admin" },
  { pattern: "/api/settings/llm-pool", method: "PUT", permission: "admin" },
  { pattern: "/api/settings/llm-pool", method: "POST", permission: "admin" },
  { pattern: "/api/settings/llm-pool/balance", method: "POST", permission: "admin" },
  { pattern: "/api/settings/system-config", method: "PUT", permission: "admin" },
  { pattern: "/api/settings/system-config", method: "POST", permission: "admin" },
  { pattern: "/api/settings/sql-export", method: "*", permission: "admin" },
  { pattern: "/api/settings/agents", method: "PUT", permission: "admin" },
  { pattern: "/api/settings/agents", method: "POST", permission: "admin" },
  { pattern: "/api/settings/agents/skills", method: "PUT", permission: "admin" },
  { pattern: "/api/settings/agents/skills", method: "POST", permission: "admin" },
  { pattern: "/api/projects/*", method: "DELETE", permission: "admin" },
  { pattern: "/api/meta", method: "POST", permission: "developer" },
  { pattern: "/api/analyze", method: "POST", permission: "developer" },
  { pattern: "/api/chat", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*/execute", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*/implement", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*/deploy", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*/push-pr", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*/preview", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*/promote", method: "POST", permission: "developer" },
  { pattern: "/api/projects/reconcile", method: "POST", permission: "developer" },
  { pattern: "/api/signals", method: "POST", permission: "developer" },
  { pattern: "/api/signals/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/signals/*", method: "DELETE", permission: "developer" },
  { pattern: "/api/signals/*/convert", method: "POST", permission: "developer" },
  { pattern: "/api/signals/*/quick-discuss", method: "POST", permission: "developer" },
  { pattern: "/api/signals/sources", method: "POST", permission: "developer" },
  { pattern: "/api/signals/sources/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/signals/sources/*", method: "DELETE", permission: "developer" },
  { pattern: "/api/signals/sources/test", method: "POST", permission: "developer" },
  { pattern: "/api/projects", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/projects/*/tasks", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*/tasks/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/projects/*/tasks/*", method: "DELETE", permission: "developer" },
  { pattern: "/api/projects/*/workspace", method: "PUT", permission: "developer" },
  { pattern: "/api/conversations", method: "POST", permission: "developer" },
  { pattern: "/api/conversations/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/conversations/*", method: "DELETE", permission: "developer" },
  { pattern: "/api/conversations/*/messages", method: "POST", permission: "developer" },
  { pattern: "/api/conversations/*/plan", method: "POST", permission: "developer" },
  { pattern: "/api/teams", method: "POST", permission: "developer" },
  { pattern: "/api/teams/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/teams/*", method: "DELETE", permission: "developer" },
  { pattern: "/api/teams/*/tasks", method: "POST", permission: "developer" },
  { pattern: "/api/teams/*/mailbox", method: "POST", permission: "developer" },
  { pattern: "/api/teams/*/intervene", method: "POST", permission: "developer" },
  { pattern: "/api/settings/preferences", method: "PUT", permission: "developer" },
  { pattern: "/api/**", method: "GET", permission: "viewer" },
];

// ── Helpers ──────────────────────────────────────────────────────────────

/** Map org_members role to API key role for backward-compatible permission checks */
function mapOrgRoleToApiKeyRole(orgRole: string | undefined | null): string {
  switch (orgRole) {
    case 'owner': return 'admin';
    case 'admin': return 'admin';
    case 'member': return 'developer';
    case 'viewer': return 'viewer';
    default: return 'viewer';
  }
}

function matchPath(pattern: string, path: string): boolean {
  const pp = pattern.split("/").filter(Boolean);
  const pa = path.split("/").filter(Boolean);

  let pi = 0;
  let ai = 0;

  while (pi < pp.length && ai < pa.length) {
    if (pp[pi] === "**") {
      if (pi === pp.length - 1) return true;
      for (let k = ai; k <= pa.length; k++) {
        if (matchPath(pp.slice(pi + 1).join("/"), pa.slice(k).join("/"))) {
          return true;
        }
      }
      return false;
    }
    if (pp[pi] === "*") {
      pi++;
      ai++;
      continue;
    }
    if (pp[pi] !== pa[ai]) return false;
    pi++;
    ai++;
  }

  return pi === pp.length && ai === pa.length;
}

function getRequiredPermission(method: string, path: string): string {
  const upper = method.toUpperCase();
  for (const rule of ROUTE_PERMISSIONS) {
    if (rule.method !== "*" && rule.method !== upper) continue;
    if (matchPath(rule.pattern, path)) return rule.permission;
  }
  return "admin";
}

function hasRole(actual: string, required: string): boolean {
  return ROLE_HIERARCHY.indexOf(actual) >= ROLE_HIERARCHY.indexOf(required);
}

/** SHA-256 hash using Web Crypto API (Edge compatible). */
async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

// ── In-memory key cache ─────────────────────────────────────────────────
// TTL correctness is guaranteed by getCachedKey (checks cachedAt + TTL on read).
// The 10K size limit in setCachedKey only prevents unbounded memory growth and
// does not affect cache correctness — stale entries are always rejected on read.

interface CachedKey {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  expires_at: string | null;
  org_id: string | null;
  user_id: string | null;
  cachedAt: number;
}

const keyCache = new Map<string, CachedKey>();

function getCachedKey(hash: string): CachedKey | null {
  const entry = keyCache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > KEY_CACHE_TTL_MS) {
    keyCache.delete(hash);
    return null;
  }
  return entry;
}

function setCachedKey(hash: string, key: CachedKey): void {
  // Limit cache size to prevent memory leaks
  if (keyCache.size > 10_000) {
    const firstKey = keyCache.keys().next().value;
    if (firstKey) keyCache.delete(firstKey);
  }
  keyCache.set(hash, key);
}

// ── Supabase REST helpers (lightweight, no SDK needed in Edge) ──────────

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function lookupKeyByHash(
  hash: string
): Promise<CachedKey | null> {
  // Check cache first
  const cached = getCachedKey(hash);
  if (cached) return cached;

  const sb = getSupabaseConfig();
  if (!sb) return null;

  const res = await fetch(
    `${sb.url}/rest/v1/api_keys?key_hash=eq.${hash}&select=id,name,role,is_active,expires_at,org_id,user_id&limit=1`,
    {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
      },
    }
  );

  if (!res.ok) {
    console.error("[Auth Middleware] Supabase lookup failed:", res.status);
    return null;
  }

  const rows = await res.json();
  if (!rows || rows.length === 0) return null;

  const row = rows[0];
  const entry: CachedKey = {
    id: row.id,
    name: row.name,
    role: row.role,
    is_active: row.is_active,
    expires_at: row.expires_at,
    org_id: row.org_id,
    user_id: row.user_id,
    cachedAt: Date.now(),
  };

  setCachedKey(hash, entry);
  return entry;
}

/** Fire-and-forget: update last_used_at */
function touchLastUsed(keyId: string): void {
  const sb = getSupabaseConfig();
  if (!sb) return;

  fetch(
    `${sb.url}/rest/v1/api_keys?id=eq.${keyId}`,
    {
      method: "PATCH",
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }
  ).catch((err) => {
    console.error('[middleware] Track API key usage failed:', err);
  });
}

/** Fire-and-forget: write audit log */
function writeAuditLog(entry: {
  api_key_id: string | null;
  method: string;
  path: string;
  status_code: number;
  ip_address: string | null;
  user_agent: string | null;
  request_body_summary: string | null;
}): void {
  const sb = getSupabaseConfig();
  if (!sb) return;

  fetch(`${sb.url}/rest/v1/audit_log`, {
    method: "POST",
    headers: {
      apikey: sb.key,
      Authorization: `Bearer ${sb.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(entry),
  }).catch((err) => {
    console.error('[middleware] Write audit log failed:', err);
  });
}

function sanitizeBodyForAudit(path: string, body: string | null): string | null {
  if (!body) return null;
  if (REDACTED_BODY_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return "[REDACTED]";
  }
  return body.length > AUDIT_BODY_MAX_LENGTH
    ? body.slice(0, AUDIT_BODY_MAX_LENGTH) + "…[truncated]"
    : body;
}

// ── CORS helpers ────────────────────────────────────────────────────────

function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN;
  let effectiveOrigin: string;
  if (allowedOrigin && origin === allowedOrigin) {
    effectiveOrigin = origin;
  } else if (process.env.NODE_ENV === 'development' && origin) {
    effectiveOrigin = origin;
  } else {
    effectiveOrigin = '';
  }
  return {
    'Access-Control-Allow-Origin': effectiveOrigin || 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(response: NextResponse, req: NextRequest): NextResponse {
  const cors = getCorsHeaders(req);
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value);
  }
  return response;
}

// ── Main middleware ─────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // CORS preflight
  if (req.method === 'OPTIONS' && pathname.startsWith('/api')) {
    return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
  }

  // Only process API routes
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ── Step 1: Auth disabled → pass through as admin ───────────────────
  if (process.env.AUTH_ENABLED !== "true") {
    const headers = new Headers(req.headers);
    headers.set("x-auth-role", "admin");
    headers.set("x-auth-enabled", "false");
    return withCors(NextResponse.next({ request: { headers } }), req);
  }

  // ── Step 2: Public paths → pass through ─────────────────────────────
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    const headers = new Headers(req.headers);
    headers.set("x-auth-role", "admin");
    headers.set("x-auth-enabled", "true");
    return withCors(NextResponse.next({ request: { headers } }), req);
  }

  // ── Step 3: Cron paths → validate CRON_SECRET ───────────────────────
  if (pathname.startsWith(CRON_PATH_PREFIX)) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return jsonResponse(
          { success: false, error: "Unauthorized: invalid CRON_SECRET" },
          401
        );
      }
    }
    const headers = new Headers(req.headers);
    headers.set("x-auth-role", "admin");
    headers.set("x-auth-enabled", "true");
    return withCors(NextResponse.next({ request: { headers } }), req);
  }

  // ── Step 4: JWT session check (takes priority over API key) ───────
  const jwtToken = await getToken({ req });
  if (jwtToken?.userId) {
    const reqHeaders = new Headers(req.headers);
    reqHeaders.set('x-auth-user-id', jwtToken.userId as string);

    // Support x-org-id header override (for org switching without re-login)
    const overrideOrgId = req.headers.get('x-org-id');
    let orgId = (jwtToken.currentOrgId as string) || '';
    let orgRole = (jwtToken.orgRole as string) || '';

    if (overrideOrgId && overrideOrgId !== jwtToken.currentOrgId) {
      orgId = overrideOrgId;
      orgRole = ''; // Will be resolved by app layer
    }

    reqHeaders.set('x-auth-org-id', orgId);
    reqHeaders.set('x-auth-org-role', orgRole);
    reqHeaders.set('x-auth-role', mapOrgRoleToApiKeyRole(orgRole));
    reqHeaders.set('x-auth-enabled', 'true');

    // If no orgId, only allow auth and invitation routes
    if (!orgId) {
      const path = req.nextUrl.pathname;
      if (!path.startsWith('/api/auth/') &&
          !path.startsWith('/api/org/invitations/accept') &&
          path !== '/no-organization' &&
          path !== '/login') {
        return NextResponse.redirect(new URL('/no-organization', req.url));
      }
    }

    return withCors(NextResponse.next({ request: { headers: reqHeaders } }), req);
  }

  // ── Step 5: Check for Supabase configuration ───────────────────────
  const sb = getSupabaseConfig();
  if (!sb) {
    // Supabase not configured — demo mode, pass through with warning
    console.warn("[Auth] AUTH_ENABLED=true but Supabase not configured. Passing through.");
    const headers = new Headers(req.headers);
    headers.set("x-auth-role", "admin");
    headers.set("x-auth-enabled", "true");
    return withCors(NextResponse.next({ request: { headers } }), req);
  }

  // ── Step 6: Extract and validate Bearer token ──────────────────────
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse(
      { success: false, error: "Unauthorized: missing or invalid Authorization header. Use 'Bearer <api_key>'." },
      401
    );
  }

  const rawKey = authHeader.slice(7); // Remove "Bearer "
  if (!rawKey) {
    return jsonResponse(
      { success: false, error: "Unauthorized: empty API key" },
      401
    );
  }

  // ── Step 7: Hash and lookup ────────────────────────────────────────
  const keyHash = await sha256Hex(rawKey);
  const keyRecord = await lookupKeyByHash(keyHash);

  if (!keyRecord) {
    return jsonResponse(
      { success: false, error: "Unauthorized: invalid API key" },
      401
    );
  }

  // ── Step 8: Validate active status ─────────────────────────────────
  if (!keyRecord.is_active) {
    return jsonResponse(
      { success: false, error: "Unauthorized: API key has been revoked" },
      401
    );
  }

  // ── Step 9: Validate expiry ────────────────────────────────────────
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return jsonResponse(
      { success: false, error: "Unauthorized: API key has expired" },
      401
    );
  }

  // ── Step 10: Check role against route permissions ──────────────────
  const requiredPermission = getRequiredPermission(method, pathname);

  if (requiredPermission !== "public" && !hasRole(keyRecord.role, requiredPermission)) {
    // Fire audit for the 403
    writeAuditLog({
      api_key_id: keyRecord.id,
      method,
      path: pathname,
      status_code: 403,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
      request_body_summary: null,
    });

    return jsonResponse(
      {
        success: false,
        error: `Forbidden: requires '${requiredPermission}' role, current role is '${keyRecord.role}'`,
      },
      403
    );
  }

  // ── Step 11: Inject headers and pass through ──────────────────────
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-auth-key-id", keyRecord.id);
  requestHeaders.set("x-auth-key-name", keyRecord.name);
  requestHeaders.set("x-auth-role", keyRecord.role);
  requestHeaders.set("x-auth-enabled", "true");
  requestHeaders.set('x-auth-org-id', keyRecord.org_id || '');
  requestHeaders.set('x-auth-user-id', keyRecord.user_id || '');

  // ── Step 12: Fire-and-forget updates ──────────────────────────────
  touchLastUsed(keyRecord.id);

  writeAuditLog({
    api_key_id: keyRecord.id,
    method,
    path: pathname,
    status_code: 200, // Middleware passed — actual status may differ
    ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
    user_agent: req.headers.get("user-agent"),
    request_body_summary: null, // Body not read in Edge middleware to avoid stream consumption
  });

  return withCors(NextResponse.next({ request: { headers: requestHeaders } }), req);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|no-organization).*)',
  ],
};
