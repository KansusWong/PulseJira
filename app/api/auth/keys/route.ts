/**
 * API key management — list & create.
 * Admin only (enforced by middleware).
 */
import { NextResponse } from "next/server";
import { errorResponse, withErrorHandler } from "@/lib/utils/api-error";
import { createApiKey, listApiKeys } from "@/lib/auth/api-key-service";
import { ROLE_HIERARCHY, type AuthRole } from "@/lib/auth/constants";

/** GET /api/auth/keys — list all keys (prefixes only, never raw keys) */
export const GET = withErrorHandler(async () => {
  const keys = await listApiKeys();
  return NextResponse.json({ success: true, data: keys });
});

/** POST /api/auth/keys — create a new API key */
export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json();
  const { name, role, expiresAt, scopedProjectIds, metadata } = body;

  if (!name || typeof name !== "string") {
    return errorResponse("'name' is required and must be a string", 400);
  }

  if (!role || !ROLE_HIERARCHY.includes(role as AuthRole)) {
    return errorResponse(
      `'role' must be one of: ${ROLE_HIERARCHY.join(", ")}`,
      400
    );
  }

  const result = await createApiKey({
    name,
    role: role as AuthRole,
    expiresAt,
    scopedProjectIds,
    metadata,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        ...result.record,
        raw_key: result.rawKey, // Shown only once
      },
      warning:
        "Save the raw_key now — it cannot be retrieved again.",
    },
    { status: 201 }
  );
});
