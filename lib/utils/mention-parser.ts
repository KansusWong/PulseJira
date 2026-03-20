/**
 * Parsed result from a user message containing @mentions.
 */
export interface ParsedMessage {
  /** Matched agent names (lowercase). '@all' becomes ['all']. */
  mentions: string[];
  /** Single target agent name, or null for broadcast (@all) / no mentions. */
  targetAgent: string | null;
  /** Message content with @mention tokens removed, trimmed. */
  cleanContent: string;
}

/**
 * Parse @mentions from user input text.
 *
 * Rules:
 * - `@agentName` must be at word boundary (not preceded by a non-space char)
 * - `@all` is a special broadcast token
 * - Unknown names are ignored (kept in cleanContent)
 * - Case-insensitive matching; returned names are lowercase
 * - When multiple agents are mentioned, the first is `targetAgent`
 */
export function parseMentions(
  text: string,
  availableAgents: string[],
): ParsedMessage {
  const agentSet = new Set(availableAgents.map((a) => a.toLowerCase()));
  // Match @word at start or preceded by whitespace. Supports hyphens/underscores.
  const mentionRegex = /(?:^|\s)@([\w-]+)/gi;

  const mentions: string[] = [];
  let cleanContent = text;

  let match: RegExpExecArray | null;
  // Collect all valid mentions first
  const validMatches: { fullMatch: string; name: string }[] = [];

  while ((match = mentionRegex.exec(text)) !== null) {
    const rawName = match[1];
    const name = rawName.toLowerCase();
    if (name === 'all' || agentSet.has(name)) {
      if (!mentions.includes(name)) {
        mentions.push(name);
      }
      // Build the exact substring to remove (including leading space if present)
      validMatches.push({ fullMatch: match[0], name });
    }
  }

  // Remove matched mentions from content
  for (const vm of validMatches) {
    cleanContent = cleanContent.replace(vm.fullMatch, ' ');
  }

  // Normalise whitespace
  cleanContent = cleanContent.replace(/\s+/g, ' ').trim();

  // Determine target
  let targetAgent: string | null = null;
  if (mentions.length > 0 && !mentions.includes('all')) {
    targetAgent = mentions[0];
  }

  return { mentions, targetAgent, cleanContent };
}
