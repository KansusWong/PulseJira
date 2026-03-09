import { NextRequest, NextResponse } from "next/server";
import {
  ENV_GROUPS,
  MANAGED_KEYS,
  getRuntimeEnvStatus,
  getGroupStatus,
  isEnvFileWritable,
  writeEnvFile,
} from "@/lib/config/runtime-env";
import { reinitializeSupabase } from "@/lib/db/client";

const SUPABASE_KEYS = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
const HIDDEN_GROUP_IDS = new Set(["scraping"]);

// ── GET — return env configuration status (masked) ──────────────────────

export async function GET() {
  try {
    const statuses = getRuntimeEnvStatus();
    const statusMap = new Map(statuses.map((s) => [s.key, s]));

    const groups = ENV_GROUPS
      .filter((group) => !HIDDEN_GROUP_IDS.has(group.id))
      .map((group) => ({
      id: group.id,
      label: group.label,
      icon: group.icon,
      required: group.required,
      status: getGroupStatus(group.vars, statusMap),
      vars: group.vars.map((v) => ({
        key: v.key,
        label: v.label,
        isSecret: v.isSecret,
        placeholder: v.placeholder,
        helpText: v.helpText,
        configured: statusMap.get(v.key)?.configured ?? false,
        maskedValue: statusMap.get(v.key)?.maskedValue ?? "",
      })),
    }));

    return NextResponse.json({ success: true, data: { groups } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// ── PUT — write env vars to .env.local + hot-patch ──────────────────────

export async function PUT(req: NextRequest) {
  try {
    // Check filesystem writable
    if (!isEnvFileWritable()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "文件系统不可写。此功能仅支持自托管环境，Vercel 等平台请通过 Dashboard 配置环境变量。",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const vars: Record<string, string> = body?.vars;

    if (!vars || typeof vars !== "object") {
      return NextResponse.json(
        { success: false, error: "请求体需包含 vars 对象" },
        { status: 400 }
      );
    }

    // White-list validation
    const managedSet = new Set(MANAGED_KEYS);
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(vars)) {
      if (managedSet.has(key) && typeof value === "string") {
        filtered[key] = value.trim();
      }
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json(
        { success: false, error: "没有有效的环境变量需要更新" },
        { status: 400 }
      );
    }

    // Write to disk + hot-patch process.env
    writeEnvFile(filtered);

    // Reinitialise Supabase if its keys were changed
    const touchedSupabase = Object.keys(filtered).some((k) =>
      SUPABASE_KEYS.has(k)
    );
    if (touchedSupabase) {
      reinitializeSupabase();
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
