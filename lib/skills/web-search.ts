export async function performFirecrawlSearch(query: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return "No search capability available (Missing FIRECRAWL_API_KEY).";

  try {
    // Firecrawl /v1/search endpoint
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query: query,
        limit: 3,
        scrapeOptions: { formats: ["markdown"] }
      })
    });

    if (!response.ok) {
      console.warn("Firecrawl search failed:", response.statusText);
      return "Search failed.";
    }

    const data = await response.json();
    if (!data.data || data.data.length === 0) return "No results found.";

    // Summarize results
    return data.data.map((item: any) => `Source: ${item.url}\nTitle: ${item.title}\nContent: ${item.markdown?.slice(0, 500)}...`).join("\n\n");
  } catch (e) {
    console.error("Search error:", e);
    return "Search error occurred.";
  }
}
