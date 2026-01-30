import { generateJSON } from '../core/llm';
import { runReActLoop, ReActLogger } from '../core/react-engine';
import OpenAI from 'openai';

// 1. One-Shot Competitor Suggestion
const COMPETITOR_ANALYSIS_PROMPT = `You are "The Researcher".
Your goal is to identify a single, high-quality, real-world competitor or reference URL for the user's software idea.
Role:
- Market-aware, knowledgeable about SaaS and tech products.
- Find the most direct competitor or a product that solves a similar problem.
- If no direct competitor exists, find a product with a similar UX pattern or business model.
- Prefer well-known, public URLs (e.g., Jira, Trello, Notion, Linear, Uber, Airbnb, etc.).
- Return a valid URL string starting with https://.

Input: User's Idea Description.

Output Format (JSON):
{
  "suggested_url": "https://www.example.com",
  "competitor_name": "Example App",
  "reasoning": "Why this is a good reference..."
}

IMPORTANT:
- "competitor_name" and "reasoning" MUST be in Simplified Chinese (简体中文).
`;

export interface CompetitorAnalysisResult {
  suggested_url: string;
  competitor_name: string;
  reasoning: string;
}

export async function suggestCompetitorUrl(ideaDescription: string): Promise<CompetitorAnalysisResult> {
  const result = await generateJSON(COMPETITOR_ANALYSIS_PROMPT, `Idea: "${ideaDescription}"`);
  return {
    suggested_url: result.suggested_url || "",
    competitor_name: result.competitor_name || "Unknown",
    reasoning: result.reasoning || ""
  };
}

// 2. Deep ReAct Research
const RESEARCHER_REACT_PROMPT = `You are "The Scout" (Researcher).
Your goal is to find concrete, real-world information to ground the discussion about a user's feature idea.
You operate in a ReAct loop (Thought -> Action -> Observation).

Commands:
- "search": Use this to search the web. Input is a search query.
- "finish": Use this when you have gathered enough information.

Output Format (JSON):
{
  "thought": "I need to find X...",
  "action": "search" | "finish",
  "action_input": "search query" or "final summary string",
  "final_answer": "Only present if action is finish. The final competitor context summary."
}

IMPORTANT:
- The "thought" and "final_answer" MUST be in Simplified Chinese (简体中文).
`;

export async function researchCompetitorContext(
  ideaDescription: string, 
  options: { 
    model?: string, 
    client?: OpenAI,
    logger?: ReActLogger
  } = {}
): Promise<string> {
  return await runReActLoop(
    "Researcher",
    RESEARCHER_REACT_PROMPT,
    `Idea: "${ideaDescription}"`,
    {
      maxSteps: 3,
      model: options.model,
      client: options.client,
      logger: options.logger
    }
  );
}
