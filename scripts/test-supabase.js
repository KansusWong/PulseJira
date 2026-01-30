const { createClient } = require('@supabase/supabase-js');
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

console.log(`URL: ${supabaseUrl}`);
console.log(`Key Length: ${supabaseKey ? supabaseKey.length : 0}`);

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log("Checking table existence...");
    
    // Check if signals table exists
    const { data, error } = await supabase
        .from('signals')
        .select('count', { count: 'exact', head: true });

    if (error) {
        console.error("Check Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Signals table exists. Count:", data); // data might be null with head:true, but error being null means table exists?
        // Actually count is returned in count property if requested?
        // With head: true, data is null.
    }
    
    // Attempt insert again
    console.log("Attempting to insert into 'signals'...");
    
    // We don't have vector extension in local node usually, so we might skip embedding or pass null
    const { data: insertData, error: insertError } = await supabase
        .from('signals')
        .insert({
            source_url: 'test-script',
            content: 'Test signal from script',
            embedding: null 
        })
        .select()
        .single();

    if (insertError) {
        console.error("Insert Error:", JSON.stringify(insertError, null, 2));
    } else {
        console.log("Insert Success:", insertData);
        await supabase.from('signals').delete().eq('id', insertData.id);
    }
}

testConnection();
