// ⚡ TRENT POWER — backend API server
// Proxies Anthropic API calls for event search
// Run: node server.js
// Requires: ANTHROPIC_API_KEY in environment

import { createServer } from 'node:http';

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('\n⚡ ANTHROPIC_API_KEY not set.');
  console.error('  Set it in Render environment variables dashboard.\n');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a Paris events data extractor. Search for REAL events happening THIS WEEK in Paris. Focus on: live music (rock, indie, post-punk, blues, electro), art exhibitions, cinema screenings, DJ nights. Prioritize venues in and near the 20th arrondissement (Belleville, Ménilmontant, Oberkampf, Jourdain).

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

async function handleSearch(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;

  let query;
  try {
    query = JSON.parse(body).query;
  } catch {
    res.writeHead(400, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ error: 'invalid JSON body' }));
  }

  if (!query) {
    res.writeHead(400, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ error: 'query required' }));
  }

  console.log(`  🔍 searching: ${query.slice(0, 60)}...`);

  try {
    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Search for: ${query}\n\nReturn ONLY a JSON array of events found.` }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    if (!apiResp.ok) {
      const err = await apiResp.text();
      console.error(`  ❌ API error: ${apiResp.status}`);
      res.writeHead(apiResp.status, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify({ error: err }));
    }

    const data = await apiResp.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');

    if (startIdx === -1 || endIdx === -1) {
      console.log('  ⚠ no JSON array in response');
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify({ events: [] }));
    }

    const events = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    console.log(`  ✅ found ${events.length} events`);
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ events }));
  } catch (e) {
    console.error(`  ❌ error: ${e.message}`);
    res.writeHead(500, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ error: e.message }));
  }
}

const server = createServer(async (req, res) => {
  // CORS headers - allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  console.log(`${req.method} ${req.url}`);

  // API route
  if (req.url === '/api/search' && req.method === 'POST') {
    return handleSearch(req, res);
  }

  // Health check
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'trent-power-backend',
      endpoints: ['/api/search']
    }));
  }

  // 404 for everything else
  res.writeHead(404, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`\n⚡ TRENT POWER BACKEND running on port ${PORT}`);
  console.log(`  API key: ${API_KEY.slice(0, 12)}...`);
  console.log(`  Endpoints: /api/search, /health\n`);
});
