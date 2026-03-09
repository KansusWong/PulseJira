/**
 * Verify migration 010_add_agentic_rag.sql results.
 *
 * Usage: npx tsx scripts/verify-migration-010.ts
 * (Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

let passed = 0;
let failed = 0;

function ok(label: string) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label: string, msg: string) {
  failed++;
  console.error(`  ✗ ${label}: ${msg}`);
}

async function main() {
  console.log('=== Verify Migration 010: Agentic RAG ===\n');

  // 1. code_patterns table
  const { error: cpErr } = await supabase.from('code_patterns').select('id').limit(0);
  cpErr ? fail('code_patterns table', cpErr.message) : ok('code_patterns table exists');

  // 2. skill_embeddings table
  const { error: seErr } = await supabase.from('skill_embeddings').select('id').limit(0);
  seErr ? fail('skill_embeddings table', seErr.message) : ok('skill_embeddings table exists');

  // 3. code_artifacts.embedding column
  const { error: caErr } = await supabase.from('code_artifacts').select('id, embedding').limit(0);
  caErr ? fail('code_artifacts.embedding column', caErr.message) : ok('code_artifacts.embedding column exists');

  // 4. RPC: match_code_patterns
  const zeroVec = new Array(256).fill(0);

  const { error: rpc1Err } = await supabase.rpc('match_code_patterns', {
    query_embedding: zeroVec,
    match_threshold: 0.99,
    match_count: 1,
  });
  rpc1Err ? fail('RPC match_code_patterns', rpc1Err.message) : ok('RPC match_code_patterns callable');

  // 5. RPC: match_skills
  const { error: rpc2Err } = await supabase.rpc('match_skills', {
    query_embedding: zeroVec,
    match_threshold: 0.99,
    match_count: 1,
  });
  rpc2Err ? fail('RPC match_skills', rpc2Err.message) : ok('RPC match_skills callable');

  // 6. RPC: match_code_artifacts
  const { error: rpc3Err } = await supabase.rpc('match_code_artifacts', {
    query_embedding: zeroVec,
    match_threshold: 0.99,
    match_count: 1,
  });
  rpc3Err ? fail('RPC match_code_artifacts', rpc3Err.message) : ok('RPC match_code_artifacts callable');

  // Summary
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
