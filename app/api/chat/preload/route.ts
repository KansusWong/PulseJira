/**
 * Preload API — warms caches before the user sends a message.
 *
 * Called fire-and-forget by the frontend when a conversation is opened.
 * Does NOT call LLM — only primes in-memory caches:
 * 1. System prompt — load config override (or use built-in REBUILD_SYSTEM_PROMPT_V1)
 * 2. Skill prompt — resolve and cache core skill definitions + embed for semantic discovery
 * 3. Tool definitions — singleton instances + zodToJsonSchema function defs
 */

import { NextResponse } from 'next/server';
import { loadAgentConfig } from '@/lib/config/agent-config';
import { GLOBAL_TOOL_NAMES } from '@/agents/rebuild';
import { REBUILD_SYSTEM_PROMPT_V1 } from '@/agents/rebuild/prompts/system';
import { buildSkillPromptForAgent } from '@/lib/skills/agent-skill-runtime';
import { initializeSkillRegistry, getAllSkills } from '@/lib/skills/skill-registry';
import { embedAllSkills } from '@/lib/services/skill-embedder';
import { isToolRegistered, getToolsCached } from '@/lib/tools/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Non-core skills — skip during preload to reduce startup overhead. */
const NON_CORE_SKILLS = ['daily-report', 'shared-blackboard', 'daily-signal'];

export async function POST() {
  const t0 = Date.now();
  try {
    // ── Step 1: System prompt ──────────────────────────────────────────
    const configOverride = loadAgentConfig('rebuild');
    const hasOverride = !!configOverride.systemPrompt;
    // Touch the built-in prompt constant to ensure the module is loaded
    const _basePrompt = configOverride.systemPrompt ?? REBUILD_SYSTEM_PROMPT_V1;
    console.log(
      `[preload] 1/3 System prompt warmed (override=${hasOverride}) in ${Date.now() - t0}ms`,
    );

    // ── Step 2: Skill prompt (core skills only) ────────────────────────
    const t1 = Date.now();
    await initializeSkillRegistry();
    buildSkillPromptForAgent('rebuild', { exclude: NON_CORE_SKILLS });

    // Embed only core skills — deduplicate by skill.id
    const excludeSet = new Set(NON_CORE_SKILLS.map((s) => s.toLowerCase()));
    const seen = new Set<string>();
    const coreSkills = getAllSkills().filter((s) => {
      if (excludeSet.has(s.id.toLowerCase())) return false;
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    await embedAllSkills(coreSkills);
    console.log(
      `[preload] 2/3 Skill prompt built — ${coreSkills.length} core skills embedded, ` +
        `${NON_CORE_SKILLS.length} non-core skipped (${NON_CORE_SKILLS.join(', ')}) in ${Date.now() - t1}ms`,
    );

    // ── Step 3: Tool definitions ───────────────────────────────────────
    const t2 = Date.now();
    let toolCount = 0;
    for (const name of GLOBAL_TOOL_NAMES) {
      if (isToolRegistered(name)) {
        try {
          const tools = getToolsCached(name);
          // Pre-compute function definitions so zodToJsonSchema runs now
          for (const tool of tools) {
            tool.toFunctionDef();
          }
          toolCount++;
        } catch {
          // Skip unavailable tools
        }
      }
    }
    console.log(
      `[preload] 3/3 Tool definitions warmed — ${toolCount}/${GLOBAL_TOOL_NAMES.length} tools in ${Date.now() - t2}ms`,
    );

    console.log(`[preload] All steps completed in ${Date.now() - t0}ms`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`[preload] Failed after ${Date.now() - t0}ms:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
