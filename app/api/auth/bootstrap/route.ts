/**
 * One-time bootstrap endpoint.
 * POST with Authorization: Bearer <BOOTSTRAP_SECRET> → creates first admin key.
 *
 * Only works when api_keys table has zero rows.
 * Returns raw key (shown once). Subsequent calls return 409.
 */
import { NextResponse } from "next/server";
import { errorResponse, withErrorHandler } from "@/lib/utils/api-error";
import { createApiKey, countApiKeys } from "@/lib/auth/api-key-service";
import { assertSupabase } from "@/lib/db/client";

export const POST = withErrorHandler(async (req: Request) => {
  assertSupabase();

  // Validate BOOTSTRAP_SECRET
  const bootstrapSecret = process.env.BOOTSTRAP_SECRET;
  if (!bootstrapSecret) {
    return errorResponse(
      "BOOTSTRAP_SECRET environment variable is not configured",
      500
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${bootstrapSecret}`) {
    return errorResponse("Unauthorized: invalid bootstrap secret", 401);
  }

  // Check if any keys already exist
  const keyCount = await countApiKeys();
  if (keyCount > 0) {
    return errorResponse(
      "Bootstrap already completed — API keys already exist. Use /api/auth/keys to manage keys.",
      409
    );
  }

  // Create the first admin key
  const result = await createApiKey({
    name: "Bootstrap Admin Key",
    role: "admin",
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        ...result.record,
        raw_key: result.rawKey,
      },
      warning:
        "Save the raw_key now — it cannot be retrieved again. You may remove BOOTSTRAP_SECRET from your environment after this.",
    },
    { status: 201 }
  );
});
