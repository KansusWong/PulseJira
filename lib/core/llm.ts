import OpenAI from 'openai';

// Helper to clean JSON string from Markdown code blocks and reasoning tags
export function cleanJSON(text: string): string {
  if (!text) return "{}";
  let clean = text.trim();
  
  // Remove <think>...</think> blocks from DeepSeek Reasoner
  clean = clean.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // 1. Try to extract Markdown code block (non-greedy)
  const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    clean = codeBlockMatch[1];
  }
  
  // 2. Try to extract pure JSON object (find outer braces)
  // This handles cases where there are no code blocks but just text around the JSON,
  // or if the code block extraction left some artifacts.
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    clean = jsonMatch[0];
  }

  return clean.trim();
}

export async function generateJSON(
  systemPrompt: string, 
  userContent: string, 
  options: { 
    model?: string, 
    client?: OpenAI, 
    baseUrl?: string, 
    apiKey?: string 
  } = {}
) {
  // Use provided client or create a default one
  const client = options.client || new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    baseURL: options.baseUrl || process.env.OPENAI_BASE_URL,
  });

  const model = options.model || process.env.LLM_MODEL_NAME || "gpt-4o";

  // DeepSeek R1 (Reasoner) does not support response_format: json_object well
  // We disable it if 'reasoner' is in the model name
  const isReasoner = model.includes("reasoner");
  
  try {
    const params: any = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    };

    if (!isReasoner) {
      params.response_format = { type: "json_object" };
    }

    const completion = await client.chat.completions.create(params);
    const content = completion.choices[0].message.content || "{}";
    
    // Clean potential markdown blocks from Reasoner models or chatty models
    const cleanedContent = cleanJSON(content);

    return JSON.parse(cleanedContent);
  } catch (error) {
    console.error("LLM Generation Error:", error);
    // Return empty object or handle gracefully
    return {};
  }
}
