// Vercel Serverless Function — proxies search requests to Anthropic API
// Set ANTHROPIC_API_KEY in your Vercel environment variables

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  const systemPrompt = `You are a Paris events data extractor. Search for REAL events happening THIS WEEK in Paris. Focus on: live music (rock, indie, post-punk, blues, electro), art exhibitions, cinema screenings, DJ nights. Prioritize venues in and near the 20th arrondissement (Belleville, Ménilmontant, Oberkampf, Jourdain).

Return ONLY valid JSON array. No markdown, no backticks, no preamble. Each event object must have:
{
  "title": "exact event name",
  "venue_name": "exact venue name",
  "date": "ISO 8601 datetime",
  "end_time": "ISO 8601 or null",
  "price": number or 0 for free or null if unknown,
  "description": "1-2 sentences about the event",
  "editorial": "one confident sentence, magazine voice, why this matters",
  "vibe_tags": ["from: rock_gig, indie_live, post_punk, blues_night, electro_rock, lcd_adjacent, indie_sleaze, art_led, design_literate, divey_good, cinematic, paris_only, wine_bar, exhibition"],
  "sources": [{"name": "source name", "url": "EXACT full URL to the specific event page"}],
  "recurring": boolean,
  "editorial_pick": boolean,
  "trusted_platform": boolean,
  "solo": boolean,
  "coffee_tip": "nearby coffee suggestion or null",
  "late_night_tip": "what to do after or null"
}

CRITICAL RULES:
- Only include events you found via web search with REAL URLs that you visited
- Every URL must point to the SPECIFIC event page, not a homepage
- Do not invent events or URLs
- If you can't find the specific event URL, use the venue's programme page URL
- Include the source website name accurately
- Return 5-10 events per search, diverse across days and venues`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: `Search for: ${query}\n\nReturn ONLY a JSON array of events found.` }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ error: err });
    }

    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const startIdx = cleaned.indexOf("[");
    const endIdx = cleaned.lastIndexOf("]");

    if (startIdx === -1 || endIdx === -1) {
      return res.status(200).json({ events: [], raw: cleaned });
    }

    const events = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return res.status(200).json({ events });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
