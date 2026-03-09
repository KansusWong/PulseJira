/**
 * Audit log query endpoint — admin only (enforced by middleware).
 * GET /api/auth/audit — paginated audit log with filters.
 */
import { NextResponse } from "next/server";
import { errorResponse, withErrorHandler } from "@/lib/utils/api-error";
import { supabase, assertSupabase } from "@/lib/db/client";

/** GET /api/auth/audit?limit=50&offset=0&path=/api/meta&method=POST&since=2024-01-01 */
export const GET = withErrorHandler(async (req: Request) => {
  assertSupabase();

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const pathFilter = url.searchParams.get("path");
  const methodFilter = url.searchParams.get("method");
  const since = url.searchParams.get("since");

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (pathFilter) {
    query = query.like("path", `%${pathFilter}%`);
  }
  if (methodFilter) {
    query = query.eq("method", methodFilter.toUpperCase());
  }
  if (since) {
    query = query.gte("created_at", since);
  }

  const { data, count, error } = await query;

  if (error) {
    return errorResponse(`Failed to query audit log: ${error.message}`);
  }

  return NextResponse.json({
    success: true,
    data: {
      entries: data || [],
      total: count ?? 0,
      limit,
      offset,
    },
  });
});
