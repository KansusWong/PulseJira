import { runReActLoop, ReActLogger } from '../core/react-engine';
import { cleanJSON } from '../core/llm';
import OpenAI from 'openai';

const RED_TEAM_REACT_PROMPT = `You are "The Critic" (Red Team).
Your goal is to tear down the Blue Team's proposal.
You operate in a ReAct loop. You can use search to verify Blue Team's claims.

Commands:
- "search": Verify a specific claim or check for risks.
- "finish": Submit your final critique.

Output Format (JSON):
{
  "thought": "Blue Team claims X, I suspect Y...",
  "action": "search" | "finish",
  "action_input": "query",
  "final_answer": "Final critique JSON string (matches original Red Team output format) if finishing."
}

Final Output JSON Format (for final_answer):
{
  "critique": "Sharp critique of the proposal...",
  "technical_risks": ["risk 1", "risk 2"],
  "commercial_flaws": ["flaw 1", "flaw 2"],
  "fatal_flaw_detected": boolean
}

IMPORTANT:
- The content of "critique", "technical_risks", and "commercial_flaws" MUST be in Simplified Chinese (简体中文).
- The "thought" in the loop MUST be in Simplified Chinese (简体中文).
`;

export interface CritiqueResult {
  critique: string;
  technical_risks?: string[];
  commercial_flaws?: string[];
  fatal_flaw_detected: boolean;
  risks?: string[]; // Legacy support
}

export async function critiqueProposal(
  proposalInput: string,
  options: {
    model?: string,
    client?: OpenAI,
    logger?: ReActLogger
  } = {}
): Promise<CritiqueResult> {
  
  const redResultString = await runReActLoop(
    "RedTeam",
    RED_TEAM_REACT_PROMPT,
    proposalInput,
    {
      maxSteps: 10,
      model: options.model,
      client: options.client,
      logger: options.logger
    }
  );

  // Parse result
  try {
      const cleaned = cleanJSON(redResultString);
      if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
          return JSON.parse(cleaned);
      } else {
          throw new Error("Output is not JSON");
      }
  } catch (e) {
      console.warn("Red Team output was not valid JSON, using as raw critique:", e instanceof Error ? e.message : String(e));
      return { 
          critique: redResultString || "No critique generated.", 
          risks: ["Unstructured output detected"], 
          commercial_flaws: [], 
          fatal_flaw_detected: false 
      };
  }
}
