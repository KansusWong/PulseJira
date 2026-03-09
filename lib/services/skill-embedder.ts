/**
 * Skill Embedder — stores skill definitions as vector embeddings for semantic discovery.
 *
 * Called as a side-effect during skill registration. Failures are logged but
 * never propagated — the original text-based search continues to work as fallback.
 */

import { supabase } from '../db/client';
import { generateEmbedding } from './rag';
import type { SkillDefinition } from '../skills/types';

/**
 * Embed a single skill definition and upsert into skill_embeddings table.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function embedSkill(skill: SkillDefinition): Promise<void> {
  try {
    const text = `${skill.name} ${skill.description} ${skill.tags.join(' ')}`;
    const embedding = await generateEmbedding(text);
    if (embedding.length === 0) return;

    const { error } = await supabase
      .from('skill_embeddings')
      .upsert(
        {
          skill_id: skill.id,
          skill_name: skill.name,
          description: skill.description,
          tags: skill.tags,
          source: skill.source,
          embedding,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'skill_id' }
      );

    if (error) {
      console.error(`[skill-embedder] Failed to embed skill "${skill.id}":`, error);
    }
  } catch (error) {
    console.error(`[skill-embedder] Embedding failed for skill "${skill.id}":`, error);
  }
}

/**
 * Embed all provided skills. Typically called once after initializeSkillRegistry().
 * Fire-and-forget: errors are logged per-skill but the batch continues.
 */
export async function embedAllSkills(skills: SkillDefinition[]): Promise<void> {
  try {
    const results = await Promise.allSettled(skills.map((s) => embedSkill(s)));
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`[skill-embedder] Embedded ${succeeded}/${skills.length} skills`);
  } catch (error) {
    console.error('[skill-embedder] Batch embedding failed:', error);
  }
}
