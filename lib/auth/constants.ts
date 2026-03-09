/**
 * Auth module shared constants.
 */

/** Prefix for generated API keys — allows quick identification */
export const API_KEY_PREFIX = "rb_live_";

/** Length of the random hex portion of an API key (32 hex chars = 16 bytes) */
export const API_KEY_HEX_LENGTH = 32;

/** Characters shown in key_prefix for display (prefix + first 8 hex chars) */
export const KEY_PREFIX_DISPLAY_LENGTH = API_KEY_PREFIX.length + 8;

/** In-memory cache TTL for key lookups (ms) */
export const KEY_CACHE_TTL_MS = 60_000;

/** Maximum length for audit log request body summary */
export const AUDIT_BODY_MAX_LENGTH = 1_000;

/** Paths that are always accessible without authentication */
export const PUBLIC_PATHS = ["/api/health", "/api/auth/bootstrap"];

/** Path prefixes that use CRON_SECRET instead of API key auth */
export const CRON_PATH_PREFIXES = ["/api/cron/"];

/** Paths whose request bodies should be redacted in audit logs */
export const REDACTED_BODY_PATHS = [
  "/api/settings/env",
  "/api/auth/keys",
  "/api/auth/bootstrap",
];

/** Role hierarchy — higher index = more permissions */
export const ROLE_HIERARCHY = ["viewer", "developer", "admin"] as const;

export type AuthRole = (typeof ROLE_HIERARCHY)[number];
