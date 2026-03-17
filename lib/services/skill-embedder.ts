/**
 * Skill Embedder — stores skill definitions as vector embeddings for semantic discovery.
 *
 * Called as a side-effect during skill registration. Failures are logged but
 * never propagated — the original text-based search continues to work as fallback.
 *
 * Uses an in-memory content-hash cache to skip embedding API calls for
 * unchanged skills. The cache lives for the lifetime of the server process.
 */

import { supabase } from '../db/client';
import { generateEmbedding } from './rag';
import type { SkillDefinition } from '../skills/types';

// In-memory cache: skill_id → content hash of last successful embedding
const embeddedHashCache = new Map<string, string>();

/** Simple hash of the text content used for embedding. */
function contentHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

/**
 * Embed a single skill definition and upsert into skill_embeddings table.
 * Skips the embedding API call if the skill content hasn't changed since last embed.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function embedSkill(skill: SkillDefinition): Promise<boolean> {
  try {
    const text = `${skill.name} ${skill.description} ${skill.tags.join(' ')}`;
    const hash = contentHash(text);

    // Skip if already embedded with same content
    if (embeddedHashCache.get(skill.id) === hash) return false;

    const embedding = await generateEmbedding(text);
    if (embedding.length === 0) return false;

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
      return false;
    }

    embeddedHashCache.set(skill.id, hash);
    return true;
  } catch (error) {
    console.error(`[skill-embedder] Embedding failed for skill "${skill.id}":`, error);
    return false;
  }
}

/**
 * Embed all provided skills. Typically called once after initializeSkillRegistry().
 * Skills with unchanged content are skipped (cache hit).
 * Fire-and-forget: errors are logged per-skill but the batch continues.
 */
export async function embedAllSkills(skills: SkillDefinition[]): Promise<void> {
  try {
    const results = await Promise.allSettled(skills.map((s) => embedSkill(s)));
    const embedded = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
    const skipped = results.filter((r) => r.status === 'fulfilled' && r.value === false).length;
    console.log(`[skill-embedder] Embedded ${embedded}/${skills.length} skills (${skipped} cached)`);
  } catch (error) {
    console.error('[skill-embedder] Batch embedding failed:', error);
  }
}
