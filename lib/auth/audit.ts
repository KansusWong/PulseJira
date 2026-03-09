/**
 * Audit logging service.
 * Fire-and-forget insert to audit_log table.
 */
import { supabase, supabaseConfigured } from "@/lib/db/client";
import { AUDIT_BODY_MAX_LENGTH, REDACTED_BODY_PATHS } from "./constants";

export interface AuditEntry {
  apiKeyId: string | null;
  method: string;
  path: string;
  statusCode?: number;
  ipAddress?: string;
  userAgent?: string;
  requestBodySummary?: string;
}

/**
 * Sanitize a request body for audit logging.
 * Redacts bodies for sensitive paths and truncates to max length.
 */
export function sanitizeBody(
  path: string,
  body: string | null | undefined
): string | null {
  if (!body) return null;

  const shouldRedact = REDACTED_BODY_PATHS.some(
    (p) => path === p || path.startsWith(p + "/")
  );
  if (shouldRedact) return "[REDACTED]";

  if (body.length > AUDIT_BODY_MAX_LENGTH) {
    return body.slice(0, AUDIT_BODY_MAX_LENGTH) + "…[truncated]";
  }
  return body;
}

/**
 * Record an audit log entry. Fire-and-forget — errors are logged but not thrown.
 */
export function recordAudit(entry: AuditEntry): void {
  if (!supabaseConfigured) return;

  supabase
    .from("audit_log")
    .insert({
      api_key_id: entry.apiKeyId,
      method: entry.method,
      path: entry.path,
      status_code: entry.statusCode,
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
      request_body_summary: entry.requestBodySummary,
    })
    .then(({ error }) => {
      if (error) {
        console.error("[Audit] Failed to write audit log:", error.message);
      }
    });
}
