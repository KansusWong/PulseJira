import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

type DbProvider = 'supabase' | 'sqlite';

function detectProvider(): DbProvider {
  const explicit = process.env.DB_PROVIDER;
  if (explicit === 'sqlite') return 'sqlite';
  if (explicit === 'supabase') return 'supabase';

  const hasSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return hasSupabase ? 'supabase' : 'sqlite';
}

export const dbProvider: DbProvider = detectProvider();

// ---------------------------------------------------------------------------
// globalThis singleton — persists across Next.js hot-reloads & warm starts
// ---------------------------------------------------------------------------

const globalForDb = globalThis as unknown as {
  _supabaseClient?: SupabaseClient;
  _supabaseConfigured?: boolean;
  _sqliteClient?: any; // SqliteClient (lazy import to avoid bundling on supabase path)
  _dbProvider?: DbProvider;
};

// ---------------------------------------------------------------------------
// Supabase path (original logic)
// ---------------------------------------------------------------------------

const SERVER_CLIENT_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
};

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function initSupabaseClient(): SupabaseClient {
  if (globalForDb._supabaseClient && globalForDb._dbProvider === 'supabase') {
    return globalForDb._supabaseClient;
  }
  const client = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder-key',
    SERVER_CLIENT_OPTIONS,
  );
  globalForDb._supabaseClient = client;
  globalForDb._dbProvider = 'supabase';
  return client;
}

// ---------------------------------------------------------------------------
// SQLite path (lazy-loaded)
// ---------------------------------------------------------------------------

function initSqliteClient(): any {
  if (globalForDb._sqliteClient && globalForDb._dbProvider === 'sqlite') {
    return globalForDb._sqliteClient;
  }
  // Dynamic require to avoid bundling better-sqlite3 in Supabase mode
  const { createSqliteClient } = require('./sqlite-client') as typeof import('./sqlite-client');
  const dbPath = process.env.SQLITE_DB_PATH || join(process.cwd(), 'data', 'rebuild.db');
  const client = createSqliteClient(dbPath);
  globalForDb._sqliteClient = client;
  globalForDb._dbProvider = 'sqlite';
  return client;
}

// ---------------------------------------------------------------------------
// Unified exports
// ---------------------------------------------------------------------------

// `supabaseConfigured` — in SQLite mode this is TRUE so that all
// `if (!supabaseConfigured) return` guard clauses pass through.
export let supabaseConfigured: boolean = dbProvider === 'supabase'
  ? !!(supabaseUrl && supabaseKey)
  : true; // SQLite is always "configured"

if (!supabaseConfigured && dbProvider === 'supabase' && typeof window === 'undefined') {
  console.warn(
    '⚠️  Supabase environment variables missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). ' +
    'Database features will be unavailable. Running in demo/offline mode.'
  );
}

if (dbProvider === 'sqlite' && typeof window === 'undefined') {
  console.log('📦 Using SQLite local database (./data/rebuild.db)');
}

// The main export — typed as SupabaseClient for zero-change compatibility,
// but may actually be a SqliteClient with the same `.from()` / `.rpc()` API.
export let supabase: SupabaseClient = (
  dbProvider === 'supabase'
    ? initSupabaseClient()
    : initSqliteClient()
) as unknown as SupabaseClient;

// Persist configured state
if (dbProvider === 'supabase') {
  globalForDb._supabaseConfigured = supabaseConfigured;
  supabaseConfigured = globalForDb._supabaseConfigured ?? supabaseConfigured;
}

/** Throws if the database is not configured. */
export function assertSupabase(): void {
  if (!supabaseConfigured) {
    throw new Error(
      'Database is not configured. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or use SQLite mode.'
    );
  }
}

/**
 * Re-read process.env and rebuild the Supabase client.
 * Called after env vars are hot-patched via the setup UI.
 * Only meaningful in Supabase mode.
 */
export function reinitializeSupabase(): void {
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  supabaseConfigured = !!(supabaseUrl && supabaseKey);

  if (supabaseConfigured) {
    supabase = createClient(supabaseUrl!, supabaseKey!, SERVER_CLIENT_OPTIONS);
    globalForDb._supabaseClient = supabase as any;
    globalForDb._supabaseConfigured = supabaseConfigured;
    globalForDb._dbProvider = 'supabase';
  }
}
