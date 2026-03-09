/**
 * Connector registry — exports all connectors for easy access.
 */

// External connectors
export { createOpenAIClient, getDefaultModel } from './external/openai';
export { createDeepSeekClient, getDeepSeekModel, isDeepSeekAvailable } from './external/deepseek';
export {
  crawl4aiSearch,
  isCrawl4AIAvailable,
  firecrawlSearch,
  isFirecrawlAvailable,
} from './external/firecrawl';
export { supabase } from './external/supabase';

// Message bus
export { messageBus } from './bus/message-bus';
export { CHANNELS } from './bus/channels';
export type { AgentMessage, MessageHandler } from './bus/types';
