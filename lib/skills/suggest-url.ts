import { generateJSON } from '../core/llm';
import { COMPETITOR_SUGGEST_PROMPT } from '../prompts/competitor-suggest';

export interface CompetitorSuggestion {
  suggested_url: string;
  competitor_name: string;
  reasoning: string;
}

/**
 * Suggest URL Skill — One-shot competitor/reference URL suggestion.
 *
 * Given a product idea description, suggests the most relevant competitor URL.
 */
export async function suggestCompetitorUrl(ideaDescription: string): Promise<CompetitorSuggestion> {
  const result = await generateJSON(COMPETITOR_SUGGEST_PROMPT, `Idea: "${ideaDescription}"`);
  return {
    suggested_url: result.suggested_url || '',
    competitor_name: result.competitor_name || 'Unknown',
    reasoning: result.reasoning || '',
  };
}
