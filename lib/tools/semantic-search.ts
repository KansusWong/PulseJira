/**
 * semantic_search — Unified semantic search across all knowledge bases.
 *
 * Replaces the 5 separate RAG tools:
 *   - search_vision_knowledge
 *   - search_decisions
 *   - search_code_artifacts
 *   - search_code_patterns
 *   - finish_retrieval
 *
 * Uses embedding-based vector search via Supabase RPCs.
 * Global tool (no workspace dependency).
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import { generateEmbedding } from '../services/rag';

const schema = z.object({
  query: z.string().describe('Natural language search query'),
  scope: z.enum(['all', 'code', 'decisions', 'knowledge', 'patterns']).default('all')
    .describe('Search scope: all (search everything), code (code artifacts), decisions (past decisions), knowledge (vision/requirements), patterns (code patterns)'),
  file_types: z.array(z.string()).optional().describe('Filter by file extensions: ["py", "ts"]'),
  num_results: z.number().default(10).describe('Number of results to return (default: 10)'),
});

type Input = z.infer<typeof schema>;

interface SearchResult {
  source: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}

export class SemanticSearchTool extends BaseTool<Input, string> {
  name = 'semantic_search';
  description = 'Unified semantic search across project knowledge bases. Search vision documents, past decisions, code artifacts, and code patterns using natural language. Use scope parameter to narrow results to a specific category, or "all" to search everything.';
  schema = schema;

  protected async _run(input: Input): Promise<string> {
    const embedding = await generateEmbedding(input.query);
    if (embedding.length === 0) {
      return 'Semantic search unavailable (embedding generation failed — check OPENAI_API_KEY).';
    }

    let results: SearchResult[] = [];

    try {
      const { supabase } = await import('../db/client');

      switch (input.scope) {
        case 'knowledge':
          results = await searchKnowledge(supabase, embedding, input.num_results);
          break;
        case 'decisions':
          results = await searchDecisions(supabase, embedding, input.num_results);
          break;
        case 'code':
          results = await searchCodeArtifacts(supabase, embedding, input.num_results);
          break;
        case 'patterns':
          results = await searchCodePatterns(supabase, embedding, input.num_results);
          break;
        case 'all':
        default:
          results = await searchAll(supabase, embedding, input.num_results);
          break;
      }
    } catch (err: any) {
      return `Search error: ${err.message}`;
    }

    // Apply file_types filter if specified
    if (input.file_types && input.file_types.length > 0) {
      const exts = new Set(input.file_types.map(e => e.startsWith('.') ? e : `.${e}`));
      results = results.filter(r => {
        const filePath = r.metadata.file_path;
        if (!filePath) return true; // Keep non-file results
        const ext = filePath.substring(filePath.lastIndexOf('.'));
        return exts.has(ext);
      });
    }

    if (results.length === 0) {
      return `No results found for: "${input.query}" (scope: ${input.scope})`;
    }

    // Format results
    const formatted = results.map((r, i) => {
      const meta = Object.entries(r.metadata)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ');
      return `[${i + 1}] (${r.source}, score: ${r.score.toFixed(3)})\n${meta ? `  ${meta}\n` : ''}  ${r.content.slice(0, 500)}`;
    });

    return `Found ${results.length} results for "${input.query}" (scope: ${input.scope}):\n\n${formatted.join('\n\n')}`;
  }
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

async function searchKnowledge(
  supabase: any,
  embedding: number[],
  limit: number,
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('match_vision_knowledge', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit,
  });

  if (error) throw new Error(`Vision knowledge search failed: ${error.message}`);

  return (data || []).map((d: any) => ({
    source: 'knowledge',
    content: d.content || '',
    score: d.similarity || 0,
    metadata: { type: 'vision_knowledge' },
  }));
}

async function searchDecisions(
  supabase: any,
  embedding: number[],
  limit: number,
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('match_decisions', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit,
  });

  if (error) throw new Error(`Decisions search failed: ${error.message}`);

  return (data || []).map((d: any) => ({
    source: 'decisions',
    content: `Rationale: ${d.decision_rationale || ''}\nAction: ${JSON.stringify(d.result_action || {})}`,
    score: d.similarity || 0,
    metadata: { type: 'decision', signal_id: d.signal_id },
  }));
}

async function searchCodeArtifacts(
  supabase: any,
  embedding: number[],
  limit: number,
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('match_code_artifacts', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit,
  });

  if (error) throw new Error(`Code artifacts search failed: ${error.message}`);

  return (data || []).map((d: any) => ({
    source: 'code',
    content: d.content || '',
    score: d.similarity || 0,
    metadata: {
      type: d.type,
      file_path: d.file_path,
      task_id: d.task_id,
      pr_url: d.pr_url,
    },
  }));
}

async function searchCodePatterns(
  supabase: any,
  embedding: number[],
  limit: number,
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('match_code_patterns', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit,
    filter_project_id: null,
  });

  if (error) throw new Error(`Code patterns search failed: ${error.message}`);

  return (data || []).map((d: any) => ({
    source: 'patterns',
    content: `${d.name}: ${d.description}\n${d.content || ''}`,
    score: d.similarity || 0,
    metadata: {
      type: d.pattern_type,
      language: d.language,
      tags: d.tags,
      usage_count: d.usage_count,
    },
  }));
}

async function searchAll(
  supabase: any,
  embedding: number[],
  limit: number,
): Promise<SearchResult[]> {
  // Query all sources in parallel
  const perSourceLimit = Math.ceil(limit / 4) + 2; // Over-fetch, then trim

  const [knowledge, decisions, code, patterns] = await Promise.allSettled([
    searchKnowledge(supabase, embedding, perSourceLimit),
    searchDecisions(supabase, embedding, perSourceLimit),
    searchCodeArtifacts(supabase, embedding, perSourceLimit),
    searchCodePatterns(supabase, embedding, perSourceLimit),
  ]);

  const all: SearchResult[] = [];
  for (const result of [knowledge, decisions, code, patterns]) {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  }

  // Sort by score descending and take top N
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, limit);
}
