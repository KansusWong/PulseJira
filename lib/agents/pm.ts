import OpenAI from 'openai';
import { retrieveContext, storeDecision } from '../rag';
import { PM_SYSTEM_PROMPT } from '../prompts';
import { generateJSON } from '../core/llm';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function clarifyRequirements(signalId: string, signalContent: string) {
  // 1. Initial Context
  const ragContext = await retrieveContext(signalContent);

  const systemPrompt = PM_SYSTEM_PROMPT;
  
  const userMessageContent = `
Incoming Signal:
${signalContent}

Vision Context:
${ragContext.visionContext}

Past Decisions:
${ragContext.pastDecisions}

Please analyze this signal and output a structured PRD.
`;

  // 2. LLM Call (PM Agent usually just needs One-Shot reasoning)
  // Use generateJSON skill for robust output
  const result = await generateJSON(systemPrompt, userMessageContent, {
      client: openai,
      model: process.env.LLM_MODEL_NAME || "glm-4"
  });

  // 3. Store the PRD
  await storeDecision(signalId, signalContent, "Product Requirements Defined", result);

  return result; // Returns the PRD object
}
