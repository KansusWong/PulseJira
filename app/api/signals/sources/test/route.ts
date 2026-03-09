/**
 * Signal Source Test API — validate default Crawl4AI + site mode before creating a source.
 *
 * POST /api/signals/sources/test
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/utils/api-error";
import { getSignalPlatformDefinition } from "@/lib/services/signal-platform-registry";
import { getPreferences } from "@/lib/services/preferences-store";
import type { SignalSource } from "@/lib/services/signal-source-types";

function normalizeSourceUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildSiteIdentifier(rawUrl: string): string {
  const normalizedUrl = normalizeSourceUrl(rawUrl);
  if (!normalizedUrl) return "";

  try {
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, "");
    return `site:${hostname}`;
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const platformName = String(body.platformName || "").trim();
    const urlInput = String(body.url || "").trim();
    const keywordsInput = String(body.keywords || "");

    if (!platformName || !urlInput) {
      return errorResponse("platformName and url are required", 400);
    }

    const normalizedUrl = normalizeSourceUrl(urlInput);
    if (!normalizedUrl) {
      return errorResponse("Invalid URL", 400);
    }

    const identifier = buildSiteIdentifier(normalizedUrl);
    if (!identifier) {
      return errorResponse("Failed to build site identifier", 400);
    }

    const definition = getSignalPlatformDefinition("generic-web");
    if (!definition) {
      return errorResponse("Missing generic-web adapter", 500);
    }

    const requestKeywords = keywordsInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const preferenceKeywords =
      requestKeywords.length > 0 ? [] : (await getPreferences()).topics || [];
    const keywords = (requestKeywords.length > 0 ? requestKeywords : preferenceKeywords)
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    const source: SignalSource = {
      id: "preview-generic-web",
      platform: "generic-web",
      identifier,
      label: platformName,
      keywords,
      interval_minutes: 60,
      active: true,
      last_fetched_at: null,
      created_at: new Date().toISOString(),
      config: {
        mode: "crawl4ai-site",
        platformName,
        url: normalizedUrl,
        query_hint_keywords: keywords,
      },
    };

    const items = await definition.collect(source);
    const count = Array.isArray(items) ? items.length : 0;

    return NextResponse.json({
      success: true,
      data: {
        hasData: count > 0,
        count,
        mode: "crawl4ai-site",
        generatedIdentifier: identifier,
        normalizedUrl,
        resolvedKeywords: keywords,
      },
    });
  } catch (e: any) {
    console.error("[API Error] POST /api/signals/sources/test:", e);
    return errorResponse(e.message || "Internal Server Error");
  }
}
