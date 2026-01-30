import { supabase } from './supabase';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined, // Ensure undefined if empty string
});

export async function generateEmbedding(text: string) {
  if (!process.env.OPENAI_API_KEY) return [];
  
  try {
    const response = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL_NAME || "text-embedding-3-small",
      input: text.replace(/\n/g, " "),
      dimensions: 256,
    });
    if (!response.data || response.data.length === 0) {
      console.warn("No embedding returned from OpenAI for text length:", text.length);
      return [];
    }
    return response.data[0].embedding;
  } catch (e) {
    console.error("Embedding generation failed:", e);
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
      console.error("Error storing signal:", error);
      return null;
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
