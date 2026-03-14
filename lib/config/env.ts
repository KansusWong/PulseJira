/**
 * Environment variable validation — runs once on server startup.
 * Imported from the root layout to trigger at app boot.
 */
import { loadRuntimeOverrides } from './runtime-env';

// Hot-patch process.env from .env.local before validation checks
if (typeof window === 'undefined') {
  loadRuntimeOverrides();
}

// --- Database ---
export const isDBConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- LLM ---
export const isLLMConfigured = !!process.env.OPENAI_API_KEY;

// --- GitHub ---
export const isGitHubConfigured = !!process.env.GITHUB_TOKEN;

// --- Social connectors ---
export const isRedditConfigured = !!(
  process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
);
export const isTwitterConfigured = !!process.env.TWITTER_BEARER_TOKEN;
export const isYouTubeConfigured = !!process.env.YOUTUBE_API_KEY;

// --- Startup logging (server-side only, print once) ---
const _envWarningsPrinted = (globalThis as any).__ENV_WARNINGS_PRINTED;
if (typeof window === 'undefined' && !_envWarningsPrinted) {
  (globalThis as any).__ENV_WARNINGS_PRINTED = true;
  const warnings: string[] = [];

  if (!isDBConfigured) {
    warnings.push(
      '[DB] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — database features unavailable'
    );
  }

  if (!isLLMConfigured) {
    warnings.push(
      '[LLM] OPENAI_API_KEY missing — AI/LLM features unavailable'
    );
  }

  // Optional integrations — uncomment to re-enable warnings
  // if (!isGitHubConfigured) {
  //   warnings.push(
  //     '[GitHub] GITHUB_TOKEN missing — PR creation and repo operations unavailable'
  //   );
  // }

  // const connectorsMissing: string[] = [];
  // if (!isRedditConfigured) connectorsMissing.push('Reddit');
  // if (!isTwitterConfigured) connectorsMissing.push('Twitter');
  // if (!isYouTubeConfigured) connectorsMissing.push('YouTube');
  // if (connectorsMissing.length > 0) {
  //   warnings.push(
  //     `[Connectors] ${connectorsMissing.join(', ')} credentials missing — signal collection from these platforms unavailable`
  //   );
  // }

  if (warnings.length > 0) {
    console.warn('=== Environment Configuration Warnings ===');
    for (const w of warnings) {
      console.warn(`  ⚠️  ${w}`);
    }
    console.warn('==========================================');
  }
}
