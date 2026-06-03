/**
 * Vercel serverless function — scrapes PAA for a single keyword via SerpAPI REST.
 * GET /api/scrape?keyword=...&location=...&max_depth=3&max_questions=50&delay=1.5
 */

const SERPAPI_KEY = process.env.SERPAPI_KEY || "";

async function fetchPAA(query, apiKey, location) {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    location,
    hl: "en",
    gl: "us",
    api_key: apiKey,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpAPI error: ${res.status}`);
  const data = await res.json();
  return data.related_questions || [];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapePAADeep(seed, apiKey, location, maxDepth, maxQuestions, delayMs) {
  const rows = [];
  const seen = new Set();
  const queue = [{ query: seed, depth: 0, parent: null }];

  while (queue.length > 0 && rows.length < maxQuestions) {
    const { query, depth, parent } = queue.shift();
    if (depth > maxDepth) continue;

    const blocks = await fetchPAA(query, apiKey, location);
    await sleep(delayMs);

    for (const item of blocks) {
      if (rows.length >= maxQuestions) break;
      const question = (item.question || "").trim();
      if (!question || seen.has(question)) continue;
      seen.add(question);

      rows.push({
        seed_keyword: seed,
        depth,
        parent_question: parent || seed,
        paa_question: question,
        snippet: item.snippet || "",
        source_title: item.title || "",
        source_link: item.link || "",
        displayed_link: item.displayed_link || "",
        date: item.date || "",
      });

      if (depth < maxDepth) {
        queue.push({ query: question, depth: depth + 1, parent: question });
      }
    }
  }

  return rows;
}

export default async function handler(req, res) {
  const { keyword, location = "United States", max_depth = "3", max_questions = "50", delay = "1.5" } = req.query;
  const apiKey = SERPAPI_KEY;

  if (!apiKey) return res.status(500).json({ error: "SERPAPI_KEY environment variable not set." });
  if (!keyword) return res.status(400).json({ error: "keyword is required." });

  try {
    const rows = await scrapePAADeep(
      keyword,
      apiKey,
      location,
      parseInt(max_depth),
      parseInt(max_questions),
      parseFloat(delay) * 1000
    );
    res.status(200).json({ rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const config = { maxDuration: 300 };
