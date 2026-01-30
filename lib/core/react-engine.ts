import OpenAI from 'openai';
import { cleanJSON } from './llm';
import { performFirecrawlSearch } from '../skills/web-search';

// Standardized Interface for ReAct Logger
export interface ReActLogger {
  log(message: string): void;
}

export interface ReActOptions {
  maxSteps?: number;
  model?: string;
  client?: OpenAI;
  logger?: ReActLogger;
}

// Helper for ReAct Loop logic (Text-based, Thought -> Action -> Observation)
export async function runReActLoop(
  agentName: string, 
  systemPrompt: string, 
  initialUserContent: string, 
  options: ReActOptions = {}
): Promise<string> {
  const { 
    maxSteps = 5, 
    model = process.env.LLM_MODEL_NAME || "gpt-4o",
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL }),
    logger = { log: console.log }
  } = options;

  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: initialUserContent }
  ];
  
  let finalAnswer = "";
  
  // Check for Reasoner model
  const isReasoner = model.includes("reasoner");

  for (let step = 0; step < maxSteps; step++) {
    const stepMsg = `[${agentName}] Step ${step + 1}...`;
    logger.log(stepMsg);
    
    // Call LLM
    const params: any = {
      model: model,
      messages: messages as any,
    };

    if (!isReasoner) {
      params.response_format = { type: "json_object" }; // Enforce JSON for structured thought/action
    }

    const completion = await client.chat.completions.create(params);
    
    const responseContent = completion.choices[0].message.content || "{}";
    let response;
    try {
      const cleaned = cleanJSON(responseContent);
      // Attempt to extract JSON using regex if direct parse fails
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonToParse = jsonMatch ? jsonMatch[0] : cleaned;
      
      response = JSON.parse(jsonToParse);
    } catch (e) {
      console.warn(`[${agentName}] Failed to parse JSON response:`, responseContent);
      
      if (step < maxSteps - 1) {
          // Self-correction: Feed the error back to the model
          logger.log(`[${agentName}] JSON Parse Error. Asking for correction...`);
          messages.push({ role: "assistant", content: responseContent });
          messages.push({ role: "user", content: "Error: Your previous response was not valid JSON. Please return ONLY a valid JSON object matching the specified format." });
          continue;
      }
      
      // Fallback
      if (isReasoner) {
         finalAnswer = responseContent;
         break;
      }
      
      finalAnswer = responseContent;
      break;
    }

    // Check if we have a final answer or need to act
    if (response.final_answer) {
        finalAnswer = typeof response.final_answer === 'object' 
            ? JSON.stringify(response.final_answer) 
            : String(response.final_answer);
        break;
    }
    
    if (response.action === "search") {
        const actionMsg = `[${agentName}] Action: Search for "${response.action_input}"`;
        logger.log(actionMsg);

        const searchResult = await performFirecrawlSearch(response.action_input);
        logger.log(`[${agentName}] Observation: Found ${searchResult.length} chars of data.`);
        
        // Feed observation back to LLM
        messages.push({ role: "assistant", content: responseContent });
        messages.push({ role: "user", content: `Observation: ${searchResult}` });
    } else {
        // Fallback or Unknown action, just stop
        console.warn(`[${agentName}] Unknown action or format:`, response);
        logger.log(`[${agentName}] Finished or Unknown action.`);
        finalAnswer = response.thought || JSON.stringify(response); 
        break;
    }
  }
  
  // If we ran out of steps without a final answer
  if (!finalAnswer) {
      console.warn(`[${agentName}] Max steps reached without final_answer.`);
      finalAnswer = JSON.stringify({
          critique: "Analysis timed out or inconclusive (Max steps reached).",
          risks: ["Agent failed to converge"],
          commercial_flaws: [],
          fatal_flaw_detected: false
      });
  }
  
  return finalAnswer;
}
