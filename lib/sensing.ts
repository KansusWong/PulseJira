import { supabase } from './supabase';
import { storeSignal } from './rag';

// Mock fetching function - in production this would use puppeteer/cheerio/rss-parser
async function fetchContent(url: string, type: string): Promise<{ content: string, hash: string }> {
  // TODO: Implement actual fetching logic based on type
  console.log(`Fetching ${url} via ${type}`);
  return { 
    content: `Updated content from ${url}`, 
    hash: "some-hash-" + Date.now() 
  };
}

export async function processSubscriptions() {
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('active', true);

  if (error || !subs) return;

  const now = new Date();

  for (const sub of subs) {
    const lastScraped = sub.last_scraped_at ? new Date(sub.last_scraped_at) : new Date(0);
    const nextRun = new Date(lastScraped.getTime() + sub.interval_minutes * 60000);

    if (now >= nextRun) {
      try {
        const { content } = await fetchContent(sub.url, sub.type);
        
        // Store as new signal
        await storeSignal(sub.url, content);

        // Update last_scraped_at
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({ last_scraped_at: now.toISOString() })
          .eq('id', sub.id);
        
        if (updateError) {
           console.error(`Failed to update subscription timestamp for ${sub.url}`, updateError);
        }
          
        console.log(`Processed subscription: ${sub.url}`);
      } catch (e) {
        console.error(`Failed to process ${sub.url}`, e);
      }
    }
  }
}
