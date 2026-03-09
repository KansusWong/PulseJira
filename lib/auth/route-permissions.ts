/**
 * Route-to-permission mapping for all API endpoints.
 *
 * Role hierarchy: admin > developer > viewer
 * A role implicitly has all permissions of lower roles.
 *
 * Default for unmatched routes: "admin" (fail-safe).
 */
import { type AuthRole } from "./constants";

export type PermissionLevel = AuthRole | "public";

interface RoutePermission {
  /** Glob-style path pattern. Supports `*` for single segment and `**` for any depth. */
  pattern: string;
  /** HTTP method or "*" for all methods */
  method: string;
  /** Minimum role required */
  permission: PermissionLevel;
}

/**
 * Ordered permission rules — first match wins.
 * More specific rules should come before general ones.
 */
const ROUTE_PERMISSIONS: RoutePermission[] = [
  // ── Public ──────────────────────────────────────────────────────────
  { pattern: "/api/health", method: "*", permission: "public" },

  // ── Cron (uses CRON_SECRET, handled separately in middleware) ──────
  { pattern: "/api/cron/**", method: "*", permission: "public" },

  // ── Auth management (admin only) ──────────────────────────────────
  { pattern: "/api/auth/**", method: "*", permission: "admin" },

  // ── Settings mutations (admin only) ────────────────────────────────
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

  // ── Project deletion (admin only) ──────────────────────────────────
  { pattern: "/api/projects/*", method: "DELETE", permission: "admin" },

  // ── Developer: pipeline execution ─────────────────────────────────
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

  // ── Developer: signal CRUD ────────────────────────────────────────
  { pattern: "/api/signals", method: "POST", permission: "developer" },
  { pattern: "/api/signals/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/signals/*", method: "DELETE", permission: "developer" },
  { pattern: "/api/signals/*/convert", method: "POST", permission: "developer" },
  { pattern: "/api/signals/*/quick-discuss", method: "POST", permission: "developer" },
  { pattern: "/api/signals/sources", method: "POST", permission: "developer" },
  { pattern: "/api/signals/sources/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/signals/sources/*", method: "DELETE", permission: "developer" },
  { pattern: "/api/signals/sources/test", method: "POST", permission: "developer" },

  // ── Developer: project mutations ──────────────────────────────────
  { pattern: "/api/projects", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/projects/*/tasks", method: "POST", permission: "developer" },
  { pattern: "/api/projects/*/tasks/*", method: "PATCH", permission: "developer" },
  { pattern: "/api/projects/*/tasks/*", method: "DELETE", permission: "developer" },
  { pattern: "/api/projects/*/workspace", method: "PUT", permission: "developer" },

  // ── Developer: conversation & team management ─────────────────────
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

  // ── Developer: settings read-write for preferences ────────────────
  { pattern: "/api/settings/preferences", method: "PUT", permission: "developer" },

  // ── Viewer: all GET endpoints ─────────────────────────────────────
  { pattern: "/api/**", method: "GET", permission: "viewer" },
];

/**
 * Match a URL path against a glob pattern.
 * Supports `*` (single segment) and `**` (any number of segments).
 */
function matchPath(pattern: string, path: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);

  let pi = 0; // pattern index
  let pa = 0; // path index

  while (pi < patternParts.length && pa < pathParts.length) {
    const seg = patternParts[pi];

    if (seg === "**") {
      // If ** is the last pattern segment, it matches everything remaining
      if (pi === patternParts.length - 1) return true;
      // Try matching the rest of the pattern against every suffix of the path
      for (let k = pa; k <= pathParts.length; k++) {
        if (matchPath(patternParts.slice(pi + 1).join("/"), pathParts.slice(k).join("/"))) {
          return true;
        }
      }
      return false;
    }

    if (seg === "*") {
      // Match any single segment
      pi++;
      pa++;
      continue;
    }

    if (seg !== pathParts[pa]) return false;
    pi++;
    pa++;
  }

  return pi === patternParts.length && pa === pathParts.length;
}

/**
 * Get the required permission level for a given method + path combination.
 * Returns "admin" for unmatched routes (fail-safe).
 */
export function getRequiredPermission(method: string, path: string): PermissionLevel {
  const upperMethod = method.toUpperCase();

  for (const rule of ROUTE_PERMISSIONS) {
    if (rule.method !== "*" && rule.method !== upperMethod) continue;
    if (matchPath(rule.pattern, path)) {
      return rule.permission;
    }
  }

  // Fail-safe: unmatched routes require admin
  return "admin";
}
