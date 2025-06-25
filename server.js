#!/usr/bin/env node
/*
  server.js
  ---------
  Lightweight Express server that loads `data/hotels.csv`, exposes a POST /search
  endpoint and serves the UI from /public.

  → POST /search  { "query": "show me marriott properties in delhi ..." }
     returns      { count: <n>, data: [...] }

  The user query is sent to OpenAI which responds with a JSON filter. We then
  validate and apply the filter locally – no hotel data is shared with the LLM.
*/

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { parse } from 'csv-parse/sync';
import Ajv from 'ajv';
import OpenAI from 'openai';

// -----------------------------
// Data loading
// -----------------------------
const csvPath = path.join(process.cwd(), 'data', 'hotels.csv');
if (!fs.existsSync(csvPath)) {
  console.error('❌ data/hotels.csv not found – run "npm run extract" first.');
  process.exit(1);
}
const rawRecords = parse(fs.readFileSync(csvPath, 'utf8'), {
  columns: true,
  skip_empty_lines: true
});

// Normalise header variants coming from manual CSVs
const records = rawRecords.map(r => {
  // the uploaded CSV uses: Hotel Name, Ave Pt Value, Ave Pts / night, Ave Pts / 5 Nights
  // Map them to concise camel-case keys our code expects.
  const normalized = {
    Brand: r.Brand,
    Hotel: r['Hotel'] || r['Hotel Name'],
    City: r.City,
    AvgPtValue: r['AvgPtValue'] || r['Ave Pt Value'],
    AvgPtsNight: r['AvgPtsNight'] || r['Ave Pts / night'] || r['Ave Pts / Night'],
    AvgPts5Nights: r['AvgPts5Nights'] || r['Ave Pts / 5 Nights'] || r['Ave Pts / 5 nights'],
    State: r.State || r.state || '',
    DistanceKmFromAirport: Number(r.DistanceKmFromAirport || 0),
    // numeric fields handled below
  };

  // Coerce numeric strings → numbers (remove ₹ and commas)
  const clean = s => Number(String(s).replace(/[^0-9.]/g, ''));
  normalized.AvgPtValue = clean(normalized.AvgPtValue);
  normalized.AvgPtsNight = clean(normalized.AvgPtsNight);
  normalized.AvgPts5Nights = clean(normalized.AvgPts5Nights);
  return normalized;
});

// Build a quick lookup of state names available in the dataset
const knownStates = new Set(records.map(r => r.State.toLowerCase()).filter(Boolean));

// Map common city aliases to canonical names used in CSV
const cityAliases = {
  bangalore: 'bengaluru',
  bengaluru: 'bengaluru',
  bombay: 'mumbai',
  delhi: 'new delhi',
  gurugram: 'gurgaon',
  gurgaon: 'gurgaon'
};

function canonicalCity(name) {
  const key = name.toLowerCase();
  return cityAliases[key] || name;
}

// -----------------------------
// LLM setup
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
if (!openai.apiKey) {
  console.warn('⚠ OPENAI_API_KEY env var not set – the /search endpoint will 503');
}

const filterSchema = {
  type: 'object',
  properties: {
    city: { type: 'string' },
    brand: { type: 'string' },
    state: { type: 'string' },
    hotel: { type: 'string' },
    minPtsNight: { type: 'number' },
    maxPtsNight: { type: 'number' },
    maxDistanceKm: { type: 'number' }
  },
  additionalProperties: false
};
const ajv = new Ajv();
const validateFilter = ajv.compile(filterSchema);

async function queryToFilter(query) {
  if (!openai.apiKey) throw new Error('OPENAI_API_KEY missing');
  const systemPrompt = `Convert the user's sentence into a JSON object used to filter a hotel list. Allowed keys:\n  • city  (string – case insensitive exact match)\n  • brand (string – case insensitive exact or partial match)\n  • state (string – case insensitive exact or partial match)\n  • hotel (string – case insensitive substring to match within the hotel name)\n  • maxPtsNight (number – assume numbers refer to points, not nights)\n  • minPtsNight (number – assume numbers refer to points, not nights)\n  • maxDistanceKm (number – maximum distance from airport in kilometres)\nIf the user talks about \"nights\" (e.g. \"for 5 nights\") do NOT set any numeric point filter.\nReturn ONLY valid JSON with these keys (omit keys that don't apply). Do NOT wrap in code fences.`;

  const { choices } = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ]
  });
  const content = choices[0].message.content.trim();
  const filter = JSON.parse(content);
  // Canonicalise city name if present
  if (filter.city) filter.city = canonicalCity(filter.city);

  // If the LLM put a state name into `city`, correct it.
  if (filter.city && !filter.state) {
    const maybeState = filter.city.toLowerCase();
    if (knownStates.has(maybeState)) {
      filter.state = filter.city;
      delete filter.city;
    }
  }

  // If city is still missing but query mentions an alias, infer it
  if (!filter.city) {
    for (const alias in cityAliases) {
      if (query.toLowerCase().includes(alias)) {
        filter.city = cityAliases[alias];
        break;
      }
    }
  }

  // If the LLM produced unrealistically small point values (likely mis-parsing
  // a phrase such as "for 5 nights") drop those numeric filters.
  if (filter.maxPtsNight !== undefined && filter.maxPtsNight < 1000) delete filter.maxPtsNight;
  if (filter.minPtsNight !== undefined && filter.minPtsNight < 1000) delete filter.minPtsNight;
  if (process.env.DEBUG_LLM) console.log('LLM filter →', JSON.stringify(filter));
  return filter;
}

function contains(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function containsAllTokens(text, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  return tokens.every(tok => lower.includes(tok));
}

function applyFilter(filter) {
  let res = records;
  if (filter.city) res = res.filter(r => containsAllTokens(r.City, filter.city));

  if (filter.brand) {
    const b = filter.brand.trim().toLowerCase();
    if (b !== 'marriott') { // treat plain "marriott" as umbrella (no filtering)
      res = res.filter(r => contains(r.Brand, filter.brand) || contains(r.Hotel, filter.brand));
    }
  }

  if (filter.hotel) {
    res = res.filter(r => containsAllTokens(r.Hotel, filter.hotel));
  }

  if (filter.state) {
    res = res.filter(r => containsAllTokens(r.State, filter.state));
  }

  if (filter.maxPtsNight !== undefined) res = res.filter(r => r.AvgPtsNight <= filter.maxPtsNight);
  if (filter.minPtsNight !== undefined) res = res.filter(r => r.AvgPtsNight >= filter.minPtsNight);
  if (filter.maxDistanceKm !== undefined) res = res.filter(r => r.DistanceKmFromAirport && r.DistanceKmFromAirport <= filter.maxDistanceKm);
  return res;
}

// -----------------------------
// Express app
// -----------------------------
const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query field required' });

  try {
    const filter = await queryToFilter(query);
    // If user asked for nearest/closest, we do our own distance sort later; ignore any overly strict maxDistanceKm added by the LLM.
    const wantsNearest = /\b(nearest|closest)\b/i.test(query);
    if (wantsNearest) delete filter.maxDistanceKm;

    if (!validateFilter(filter)) {
      return res.status(422).json({ error: 'invalid filter generated', details: validateFilter.errors });
    }
    let data = applyFilter(filter);

    // If the user's original query looks for the cheapest/lowest redemption
    if (/\b(cheapest|lowest|least expensive|min(?:imum)?)\b/i.test(query)) {
      const min = Math.min(...data.map(r => r.AvgPtsNight));
      data = data.filter(r => r.AvgPtsNight === min);
    }

    // Handle nearest/closest intent: sort by distance inside the already filtered set.
    if (wantsNearest) {
      data = data
        .filter(r => r.DistanceKmFromAirport > 0)
        .sort((a, b) => a.DistanceKmFromAirport - b.DistanceKmFromAirport)
        .slice(0, 5);
    }

    res.json({ count: data.length, data });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✔ Marriott-finder API running on http://localhost:${PORT}`);
}); 