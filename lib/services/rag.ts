import { supabase } from '../db/client';
import OpenAI from 'openai';
import { withRetry } from '../core/llm';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for embedding operations');
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return _openai;
}

export async function generateEmbedding(text: string) {
  if (!process.env.OPENAI_API_KEY) return [];

  try {
    return await withRetry(async () => {
      const response = await getOpenAI().embeddings.create({
        model: process.env.EMBEDDING_MODEL_NAME || "text-embedding-3-small",
        input: text.replace(/\n/g, " "),
        dimensions: 256,
      });
      if (!response.data || response.data.length === 0) {
        console.warn("No embedding returned for text length:", text.length);
        return [];
      }
      return response.data[0].embedding;
    }, { label: 'generateEmbedding' });
  } catch (e) {
    console.error("Embedding generation failed after retries:", e);
    return [];
  }
}

export async function storeSignal(sourceUrl: string, content: string) {
  const embedding = await generateEmbedding(content);
  
    const { data, error } = await supabase
    .from('signals')
    .insert({
      source_url: sourceUrl,
      content,
      embedding: embedding.length > 0 ? embedding : null,
      status: 'DRAFT'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store signal: ${error.message}`);
  }
  return data;
}

export async function retrieveContext(query: string) {
  const embedding = await generateEmbedding(query);
  if (embedding.length === 0) return { visionContext: "", pastDecisions: "" };

  // 1. Retrieve relevant Vision chunks
  const { data: visionDocs, error: visionError } = await supabase
    .rpc('match_vision_knowledge', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 3,
    });
  
  if (visionError) console.error("Error fetching vision docs:", visionError);

  // 2. Retrieve similar past decisions (Consistency)
  const { data: pastDecisions, error: decisionsError } = await supabase
    .rpc('match_decisions', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: 5,
    });

  if (decisionsError) console.error("Error fetching past decisions:", decisionsError);

  return {
    visionContext: visionDocs?.map((d: any) => d.content).join('\n---\n') || "",
    pastDecisions: pastDecisions?.map((d: any) => `Rationale: ${d.decision_rationale}\nAction: ${JSON.stringify(d.result_action)}`).join('\n---\n') || ""
  };
}

// Helper to store decision after processing
export async function storeDecision(signalId: string, context: string, rationale: string, result: any) {
  const embedding = await generateEmbedding(context + " " + rationale);
  
  const { error } = await supabase.from('decisions').insert({
    signal_id: signalId,
    input_context: context,
    decision_rationale: rationale,
    result_action: result,
    embedding: embedding.length > 0 ? embedding : null
  });

  if (error) {
    console.error("Failed to store decision:", error);
    // We don't throw here to avoid failing the whole request just because history storage failed
  }
}

// ---------------------------------------------------------------------------
// Code Artifact Embedding
// ---------------------------------------------------------------------------

export async function storeCodeArtifactEmbedding(artifactId: string, content: string) {
  const embedding = await generateEmbedding(content);
  if (embedding.length === 0) return;

  const { error } = await supabase
    .from('code_artifacts')
    .update({ embedding })
    .eq('id', artifactId);

  if (error) {
    console.error("Failed to store code artifact embedding:", error);
  }
}

export async function searchCodeArtifacts(query: string, matchCount = 5) {
  const embedding = await generateEmbedding(query);
  if (embedding.length === 0) return [];

  const { data, error } = await supabase.rpc('match_code_artifacts', {
    query_embedding: embedding,
    match_threshold: 0.6,
    match_count: matchCount,
  });

  if (error) {
    console.error("Error searching code artifacts:", error);
    return [];
  }

  return data || [];
}
