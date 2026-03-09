import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- globalThis singleton (#18) ---
// Persists the Supabase client across:
//   - Next.js hot reloads in development (module re-evaluation)
//   - Warm starts in serverless environments (same process, new request)
const globalForSupabase = globalThis as unknown as {
  _supabaseClient?: SupabaseClient;
  _supabaseConfigured?: boolean;
};

/** Shared client options optimized for server-side usage. */
const SERVER_CLIENT_OPTIONS = {
  auth: {
    persistSession: false,   // No session storage needed on the server
    autoRefreshToken: false,  // Service role key doesn't expire
  },
};

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export let supabaseConfigured = !!(supabaseUrl && supabaseKey);

if (!supabaseConfigured && typeof window === 'undefined') {
  console.warn(
    '⚠️  Supabase environment variables missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). ' +
    'Database features will be unavailable. Running in demo/offline mode.'
  );
}

// Reuse existing client from globalThis, or create a new one
if (!globalForSupabase._supabaseClient) {
  globalForSupabase._supabaseClient = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder-key',
    SERVER_CLIENT_OPTIONS,
  );
  globalForSupabase._supabaseConfigured = supabaseConfigured;
}

export let supabase: SupabaseClient = globalForSupabase._supabaseClient;
supabaseConfigured = globalForSupabase._supabaseConfigured ?? supabaseConfigured;

/** Throws if Supabase is not configured. Use at the start of DB-critical paths. */
export function assertSupabase(): void {
  if (!supabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
}

/**
 * Re-read process.env and rebuild the Supabase client.
 * Called after env vars are hot-patched via the setup UI.
 */
export function reinitializeSupabase(): void {
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  supabaseConfigured = !!(supabaseUrl && supabaseKey);

  if (supabaseConfigured) {
    supabase = createClient(supabaseUrl!, supabaseKey!, SERVER_CLIENT_OPTIONS);
    globalForSupabase._supabaseClient = supabase;
    globalForSupabase._supabaseConfigured = supabaseConfigured;
  }
}
