import { createClient } from '@supabase/supabase-js';

// Check for valid environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Warn only once during initialization
  if (typeof window === 'undefined') { // Server-side warning
    console.warn("⚠️  Supabase environment variables missing. Database features will fail.");
  }
}

// Create client with fallback or valid credentials
// Note: Invalid URLs will throw error at createClient, so we ensure a valid-ish URL if missing.
export const supabase = createClient(
  supabaseUrl || "https://missing-credentials.example.com", 
  supabaseKey || "missing-key"
);
