/**
 * Test script — verify preload results with non-core skill exclusion.
 * Run: npx tsx --require ./scripts/mock-server-only.cjs scripts/test-preload.ts
 */

// Patch path alias
import Module from 'module';
const origResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: any[]) {
  if (request === 'server-only') return require.resolve('./noop-module.cjs');
  return origResolve.call(this, request, ...args);
};

import { register } from 'tsconfig-paths';
import path from 'path';
const root = path.resolve(import.meta.dirname || __dirname, '..');
register({ baseUrl: root, paths: { '@/*': ['./*'] } });

// --- Imports ---
// Ensure builtin agents are registered (triggers agent-registry population)
import '../lib/config/builtin-agents';
import { buildSkillPromptForAgent } from '../lib/skills/agent-skill-runtime';

// =========================================================================

const NON_CORE_SKILLS = ['daily-report', 'shared-blackboard', 'daily-signal'];

console.log('='.repeat(70));
console.log('  SKILL PRELOAD: BEFORE vs AFTER EXCLUSION');
console.log('='.repeat(70));

// --- All skills (no filter) ---
const allPrompt = buildSkillPromptForAgent('rebuild');
const allSkills = [...allPrompt.matchAll(/### Skill: (.+)/g)].map(m => m[1]);

console.log('\n  ALL skills (no filter):');
console.log(`    Count: ${allSkills.length}`);
for (const s of allSkills) {
  const isNonCore = NON_CORE_SKILLS.some(nc => s.toLowerCase().includes(nc));
  console.log(`    ${isNonCore ? '✗' : '✓'} ${s}`);
}
console.log(`    Prompt length: ${allPrompt.length} chars`);

// --- Core skills only (with filter) ---
const corePrompt = buildSkillPromptForAgent('rebuild', { exclude: NON_CORE_SKILLS });
const coreSkills = [...corePrompt.matchAll(/### Skill: (.+)/g)].map(m => m[1]);

console.log('\n  CORE skills only (after exclude):');
console.log(`    Count: ${coreSkills.length}`);
for (const s of coreSkills) {
  console.log(`    ✓ ${s}`);
}
console.log(`    Prompt length: ${corePrompt.length} chars`);

// --- Diff ---
const excluded = allSkills.filter(s => !coreSkills.includes(s));
const saved = allPrompt.length - corePrompt.length;

console.log('\n' + '─'.repeat(70));
console.log('  DIFF');
console.log('─'.repeat(70));
console.log(`  Excluded: ${excluded.join(', ') || '(none)'}`);
console.log(`  Chars saved: ${saved} (${((saved / allPrompt.length) * 100).toFixed(1)}%)`);
console.log(`  Skills: ${allSkills.length} → ${coreSkills.length}`);
console.log('='.repeat(70));
