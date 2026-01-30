const fs = require('fs');
const path = require('path');

// 1. Load Env
const envPath = path.resolve(__dirname, '../.env.local');
try {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
          process.env[key.trim()] = value.replace(/"/g, '').trim();
      }
  });
} catch (e) {
  console.warn("Could not load .env.local");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing credentials.");
    process.exit(1);
}

async function checkExposedTables() {
    // Supabase (PostgREST) exposes an OpenAPI definition at the root or /rest/v1/
    // We can fetch the root to see exposed resources.
    const url = `${supabaseUrl}/rest/v1/`;
    console.log(`Checking exposed tables at: ${url}`);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        if (!response.ok) {
            console.error(`HTTP Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error("Response:", text);
            return;
        }

        // PostgREST root returns a OpenAPI JSON object listing paths
        const data = await response.json();
        
        console.log("\n--- Exposed Tables (Swagger/OpenAPI Definitions) ---");
        const paths = data.definitions || {};
        const tables = Object.keys(paths);
        
        if (tables.length === 0) {
            console.log("No tables found in public schema definition.");
        } else {
            console.log("Found tables:", tables.join(", "));
        }

        const hasSignals = tables.includes('signals');
        console.log(`\nIs 'signals' table exposed? ${hasSignals ? "YES" : "NO"}`);
        
        if (!hasSignals) {
            console.log("\nPossible reasons if you created it:");
            console.log("1. Schema Cache is stale. -> Go to Supabase Dashboard > API > 'Reload schema cache'.");
            console.log("2. Table is not in 'public' schema.");
            console.log("3. Table permissions prevent exposure (unlikely with service_role key, but check 'Exposed Schemas' in settings).");
        }

    } catch (e) {
        console.error("Fetch Error:", e.message);
    }
}

checkExposedTables();
