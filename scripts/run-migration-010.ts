/**
 * Run migration 010_add_agentic_rag.sql and verify results.
 *
 * Usage: npx tsx scripts/run-migration-010.ts
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL(sql: string, label: string) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });
  if (error) {
    // exec_sql might not exist — try via postgrest raw query workaround
    throw error;
  }
  console.log(`✓ ${label}`);
  return data;
}

async function main() {
  console.log('=== Migration 010: Agentic RAG ===\n');
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  // Read migration file
  const sqlPath = path.join(process.cwd(), 'database/migrations/010_add_agentic_rag.sql');
  const fullSQL = fs.readFileSync(sqlPath, 'utf-8');

  // Split into individual statements (split on semicolons followed by newline, skip comments)
  const statements = fullSQL
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute.\n`);

  // Execute each statement individually
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const firstLine = stmt.split('\n').find(l => !l.startsWith('--') && l.trim()) || stmt.slice(0, 60);
    const label = `[${i + 1}/${statements.length}] ${firstLine.slice(0, 80)}...`;

    try {
      // Use Supabase SQL editor endpoint (service role required)
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ sql_text: stmt + ';' }),
      });

      if (!response.ok) {
        // Fallback: try the /sql endpoint (Supabase management API)
        const text = await response.text();
        console.log(`  ⚠ exec_sql RPC not available: ${text.slice(0, 100)}`);
        console.log(`  Attempting via pg-meta SQL endpoint...`);
        throw new Error('exec_sql not available');
      }

      console.log(`  ✓ ${label}`);
    } catch {
      // Try pg-meta endpoint (available on Supabase hosted)
      try {
        const pgMetaUrl = supabaseUrl.replace('.supabase.co', '.supabase.co');
        const response = await fetch(`${pgMetaUrl}/pg/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ query: stmt + ';' }),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error(`  ✗ ${label}\n    Error: ${text.slice(0, 200)}`);
        } else {
          console.log(`  ✓ ${label}`);
        }
      } catch (e: any) {
        console.error(`  ✗ ${label}\n    Error: ${e.message}`);
      }
    }
  }

  // --- Verification ---
  console.log('\n=== Verification ===\n');

  // Check code_patterns table
  const { data: cp, error: cpErr } = await supabase.from('code_patterns').select('id').limit(0);
  if (cpErr) {
    console.error('✗ code_patterns table: ', cpErr.message);
  } else {
    console.log('✓ code_patterns table exists');
  }

  // Check skill_embeddings table
  const { data: se, error: seErr } = await supabase.from('skill_embeddings').select('id').limit(0);
  if (seErr) {
    console.error('✗ skill_embeddings table: ', seErr.message);
  } else {
    console.log('✓ skill_embeddings table exists');
  }

  // Check code_artifacts has embedding column
  const { data: ca, error: caErr } = await supabase.from('code_artifacts').select('id, embedding').limit(0);
  if (caErr) {
    console.error('✗ code_artifacts.embedding column: ', caErr.message);
  } else {
    console.log('✓ code_artifacts.embedding column exists');
  }

  // Check RPC functions
  for (const rpc of ['match_code_patterns', 'match_skills', 'match_code_artifacts']) {
    // Call with a dummy zero vector to test existence
    const zeroVec = new Array(256).fill(0);
    const { error: rpcErr } = await supabase.rpc(rpc, {
      query_embedding: zeroVec,
      match_threshold: 0.99,
      match_count: 1,
    });
    if (rpcErr) {
      console.error(`✗ RPC ${rpc}: ${rpcErr.message}`);
    } else {
      console.log(`✓ RPC ${rpc} exists and callable`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
