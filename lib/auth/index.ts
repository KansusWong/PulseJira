/**
 * Auth context reader for route handlers.
 * Reads headers injected by middleware.ts.
 */
import { headers } from "next/headers";
import { ROLE_HIERARCHY, type AuthRole } from "./constants";

export interface AuthContext {
  keyId: string | null;
  keyName: string | null;
  role: AuthRole;
  authEnabled: boolean;
  userId: string | null;
  orgId: string | null;
  orgRole: 'owner' | 'admin' | 'member' | 'viewer' | null;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number = 403) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Read auth context from request headers (set by middleware).
 */
export function getAuthContext(): AuthContext {
  const headerStore = headers();
  const role = (headerStore.get("x-auth-role") as AuthRole) || "viewer";
  const keyId = headerStore.get("x-auth-key-id") || null;
  const keyName = headerStore.get("x-auth-key-name") || null;
  const authEnabled = headerStore.get("x-auth-enabled") === "true";
  const userId = headerStore.get("x-auth-user-id") || null;
  const orgId = headerStore.get("x-auth-org-id") || null;
  const orgRole = (headerStore.get("x-auth-org-role") as 'owner' | 'admin' | 'member' | 'viewer' | null) || null;

  return { keyId, keyName, role, authEnabled, userId, orgId, orgRole };
}

/**
 * Check if a role meets the required permission level.
 */
export function hasRole(actual: AuthRole, required: AuthRole): boolean {
  const actualIdx = ROLE_HIERARCHY.indexOf(actual);
  const requiredIdx = ROLE_HIERARCHY.indexOf(required);
  return actualIdx >= requiredIdx;
}

/**
 * Assert the current request has sufficient role.
 * Throws AuthError with 403 if insufficient.
 */
export function assertRole(required: AuthRole): void {
  const ctx = getAuthContext();
  if (!hasRole(ctx.role, required)) {
    throw new AuthError(
      `Insufficient permissions: requires '${required}' role, current role is '${ctx.role}'`
    );
  }
}

// Re-export for convenience
export { type AuthRole } from "./constants";
