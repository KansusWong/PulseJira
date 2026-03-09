/**
 * Single API key management — update & delete.
 * Admin only (enforced by middleware).
 */
import { NextResponse } from "next/server";
import { errorResponse, withErrorHandler } from "@/lib/utils/api-error";
import {
  deleteApiKey,
  revokeApiKey,
  updateApiKeyRole,
  updateApiKeyStatus,
} from "@/lib/auth/api-key-service";
import { ROLE_HIERARCHY, type AuthRole } from "@/lib/auth/constants";

/** PATCH /api/auth/keys/[keyId] — update role or is_active */
export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: { keyId: string } }) => {
    const { keyId } = params;
    const body = await req.json();

    if (body.role !== undefined) {
      if (!ROLE_HIERARCHY.includes(body.role as AuthRole)) {
        return errorResponse(
          `'role' must be one of: ${ROLE_HIERARCHY.join(", ")}`,
          400
        );
      }
      const updated = await updateApiKeyRole(keyId, body.role as AuthRole);
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.is_active !== undefined) {
      if (typeof body.is_active !== "boolean") {
        return errorResponse("'is_active' must be a boolean", 400);
      }
      const updated = await updateApiKeyStatus(keyId, body.is_active);
      return NextResponse.json({ success: true, data: updated });
    }

    return errorResponse(
      "Request body must include 'role' or 'is_active'",
      400
    );
  }
);

/** DELETE /api/auth/keys/[keyId] — hard delete a key */
export const DELETE = withErrorHandler(
  async (_req: Request, { params }: { params: { keyId: string } }) => {
    const { keyId } = params;
    await deleteApiKey(keyId);
    return NextResponse.json({ success: true, message: "API key deleted" });
  }
);
