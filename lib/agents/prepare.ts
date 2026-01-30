import OpenAI from 'openai';
import { retrieveContext } from '../rag';
import { generateJSON } from '../core/llm';
import { researchCompetitorContext, suggestCompetitorUrl } from '../skills/competitor-analysis';
import { critiqueProposal } from '../skills/critic';

// Export the simple suggestion skill for direct API usage
export { suggestCompetitorUrl };

// Types for the Circuit Breaker process
export interface CircuitBreakerResult {
  decision: "PROCEED" | "CIRCUIT_BREAK";
  summary: string;
  blue_case: {
    proposal: string;
    vision_alignment_score: number;
  };
  red_case: {
    critique: string;
    risks: string[];
  };
  arbitrator_rationale: string;
  competitor_analysis?: string;
  logs?: string[];
}

// 1. Blue Team (The Builder) - Optimistic, Vision-aligned
const BLUE_TEAM_PROMPT = `You are "The Builder" (Blue Team) in a Red/Blue team adversarial architecture.
Your goal is to take a raw signal and "Vision Context" and vehemently argue WHY this feature must be built.
Role:
- Optimistic, visionary, innovative.
- Focus on "From 0 to 1".
- Use the Vision Context to justify the feature.
- Draft a preliminary proposal that highlights user value.

Output Format (JSON):
{
  "proposal": "Detailed feature proposal...",
  "key_benefits": ["benefit 1", "benefit 2"],
  "vision_alignment_score": 90 (0-100)
}

IMPORTANT:
- The content of "proposal" and "key_benefits" MUST be in Simplified Chinese (简体中文).
- The JSON keys must remain in English.
`;

// 2. Arbitrator (The Judge) - Balanced, Decisive
const ARBITRATOR_PROMPT = `You are "The Arbitrator". You sit between the Blue Team (Builder) and Red Team (Critic).
Your goal is to decide if this feature request should proceed to the PM or be "Circuit Broken" (stopped).
Role:
- Objective, fair, but strict.
- If Red Team identifies a FATAL flaw (e.g., completely against vision, technically impossible, zero ROI), you MUST Circuit Break.
- If it's a good idea but needs refinement, you can Proceed.

Input provided: Original Signal + Blue Proposal + Red Critique.

Output Format (JSON):
{
  "decision": "PROCEED" | "CIRCUIT_BREAK",
  "summary": "Synthesis of the debate",
  "rationale": "Why you made this decision"
}

IMPORTANT:
- The content of "summary" and "rationale" MUST be in Simplified Chinese (简体中文).
- The JSON keys must remain in English.
`;

export async function runPrepareAgent(signalContent: string): Promise<CircuitBreakerResult> {
  // 1. Gather Context
  const context = await retrieveContext(signalContent);
  const visionContext = context.visionContext;
  
  const logs: string[] = [];
  const logger = { log: (msg: string) => { console.log(msg); logs.push(msg); } };

  // Configure Models
  const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
  });
  
  const deepseek = process.env.DEEPSEEK_API_KEY ? new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  }) : null;

  // Blue Team & Arbitrator -> GLM-4.6 (Creative, Instruction Following)
  const BLUE_ARBITRATOR_MODEL = process.env.LLM_MODEL_NAME || "glm-4.6";
  // Red Team -> DeepSeek Reasoner (Logic, Critical Thinking)
  const RED_TEAM_MODEL = deepseek ? (process.env.DEEPSEEK_MODEL_NAME || "deepseek-reasoner") : BLUE_ARBITRATOR_MODEL;
  
  // Clients
  const defaultClient = openai;
  const redTeamClient = deepseek || openai;

  logger.log(`[PrepareAgent] Simulation Config: Blue/Arbitrator(${BLUE_ARBITRATOR_MODEL}) vs Red(${deepseek ? 'DeepSeek' : 'Default'}).`);

  // 2. Researcher Step (Skill: Competitor Analysis)
  logger.log(`[PrepareAgent] Running Researcher (ReAct Mode)...`);
  const competitorContext = await researchCompetitorContext(signalContent, {
      model: BLUE_ARBITRATOR_MODEL,
      client: defaultClient,
      logger: logger
  });

  // 3. Blue Team Step (Internal Logic - Simple Generation)
  const blueInput = `
Raw Signal: "${signalContent}"
Vision Context: "${visionContext}"
Competitor/Market Context: "${competitorContext}"

Prove why we should build this. Use the Competitor Context to support your case.
`;
  const blueResult = await generateJSON(BLUE_TEAM_PROMPT, blueInput, { 
      client: defaultClient, 
      model: BLUE_ARBITRATOR_MODEL 
  });
  
  logger.log(`[BlueTeam] Proposal Generated: ${blueResult.proposal?.slice(0, 100)}...`);
  logger.log(`[BlueTeam] Vision Score: ${blueResult.vision_alignment_score}`);

  // 4. Red Team Step (Skill: Critic)
  logger.log(`[PrepareAgent] Running Red Team (ReAct Mode)...`);
  const redInput = `
Blue Team Proposal: ${JSON.stringify(blueResult)}
Existing Context (Vision): "${visionContext}"
Competitor/Market Context: "${competitorContext}"

Find the flaws. Be harsh. Verify claims if needed.
`;
  
  const redResult = await critiqueProposal(redInput, {
      model: RED_TEAM_MODEL,
      client: redTeamClient,
      logger: logger
  });

  // 5. Arbitrator Step (Internal Logic - Simple Generation)
  const arbitratorInput = `
  Original Signal: "${signalContent}"
  
  Blue Team (Pro): ${JSON.stringify(blueResult)}
  Red Team (Con): ${JSON.stringify(redResult)}
  
  Make a ruling.
  `;
  const arbitratorResult = await generateJSON(ARBITRATOR_PROMPT, arbitratorInput, { 
      client: defaultClient, 
      model: BLUE_ARBITRATOR_MODEL 
  });

  logger.log(`[Arbitrator] Ruling: ${arbitratorResult.decision}`);
  logger.log(`[Arbitrator] Rationale: ${arbitratorResult.rationale?.slice(0, 100)}...`);

  // 6. Construct Final Output
  return {
    decision: arbitratorResult.decision as "PROCEED" | "CIRCUIT_BREAK",
    summary: arbitratorResult.summary,
    blue_case: {
      proposal: blueResult.proposal,
      vision_alignment_score: blueResult.vision_alignment_score
    },
    red_case: {
      critique: redResult.critique,
      risks: [...(redResult.technical_risks || []), ...(redResult.commercial_flaws || []), ...(redResult.risks || [])]
    },
    arbitrator_rationale: arbitratorResult.rationale,
    competitor_analysis: competitorContext,
    logs: logs
  };
}
