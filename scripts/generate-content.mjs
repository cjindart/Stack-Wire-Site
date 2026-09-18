#!/usr/bin/env node
// Researches today's tech news with Claude (using Anthropic's server-side
// web search tool) and writes content/<today>.json — the same job this
// used to be a Claude Cowork scheduled task's, now running entirely inside
// GitHub Actions so no credential ever has to leave this repo's own secret
// store.
//
// Reads ANTHROPIC_API_KEY from the environment only (a GitHub Actions
// secret in CI, or a local .env for testing) — never logged, never written
// to any output file.
//
// Usage: ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-content.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Add it as a GitHub Actions secret ' +
    '(Settings -> Secrets and variables -> Actions), or put it in a local .env for testing.');
  process.exit(1);
}

// If this model ID 404s, check https://docs.anthropic.com/en/docs/about-claude/models
// for the current list and set ANTHROPIC_MODEL to override it.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

const CONTENT_DIR = new URL('../content/', import.meta.url).pathname;

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadYesterday() {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) return null;
  const latest = files[files.length - 1];
  return JSON.parse(readFileSync(new URL(latest, `file://${CONTENT_DIR}`), 'utf8'));
}

const EDITION_SCHEMA = {
  type: 'object',
  required: ['vol', 'no', 'date', 'tagline', 'categories', 'archive'],
  properties: {
    vol: { type: 'string' },
    no: { type: 'integer' },
    date: { type: 'string', description: 'e.g. FRIDAY, SEPTEMBER 19, 2026 (all caps)' },
    tagline: { type: 'string' },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'kicker', 'subhead', 'stories'],
        properties: {
          id: { type: 'string', description: 'url-safe id, e.g. ai-policy' },
          kicker: { type: 'string', description: 'e.g. AI & Policy' },
          subhead: { type: 'string', description: 'short italic subhead' },
          stories: {
            type: 'array',
            items: {
              type: 'object',
              required: ['headline', 'body', 'sources'],
              properties: {
                headline: { type: 'string' },
                callback: { type: ['string', 'null'], description: '"Yesterday: X — Today: Y" or null' },
                body: { type: 'array', items: { type: 'string' } },
                sources: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['name', 'url'],
                    properties: { name: { type: 'string' }, url: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    archive: {
      type: 'object',
      required: ['date', 'items'],
      properties: {
        date: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['category', 'text'],
            properties: { category: { type: 'string' }, text: { type: 'string' } },
          },
        },
      },
    },
  },
};

const yesterday = loadYesterday();
const today = todayISO();

const systemPrompt = `You are producing today's edition of "Stack Wire," a daily tech briefing.

Research today's tech news using the web_search tool. Cover the full range: AI/ML industry
news and policy, big tech product launches, software engineering and AI dev tools, and the
money side — funding rounds, M&A, acquisitions, IPOs. Search broadly (e.g. "AI news today",
"tech industry news ${today}", "startup funding announced today", "tech acquisition merger
this week", "AI coding tools news") and pull real, current stories — never invent anything.

DIVERSIFY AND VALIDATE: for each story, try to confirm it against a second independent
outlet (a wire service, an official company/agency blog, or a distinct newsroom — not a
reblog/aggregator copy of the same article) before including it, and list both as separate
sources. If only one genuinely independent report exists after a real search, it's fine to
run that story single-sourced — don't pad with low-quality aggregator reposts just to hit
two links.

${yesterday
    ? `Yesterday's edition (for continuity) is attached below as JSON. Condense its stories
into a short recap — one line per big story, grouped by category — for the new "archive"
field. For any story today that follows a real thread from yesterday (same company, same
deal, same policy fight), add a "callback" field like "Yesterday: we covered X — Today: Y
happened." Not every story needs one — only where a thread genuinely continues.`
    : `This is the first edition — there is no prior day, so every story's "callback" should
be null and "archive.items" should be an empty array, with "archive.date" set to today's date.`
}

Use 4-5 categories (reuse AI & Policy / Big Tech / Dev & AI Tools / Funding / Deals & M&A
unless today's news genuinely doesn't fit one), roughly 2-3 stories per category.

When your research is complete, call the save_edition tool exactly once with the complete,
finished edition as its input. Do not call it early or partially — finish researching first.`;

const userContent = yesterday
  ? `Today's date: ${today}.\n\nYesterday's edition JSON:\n${JSON.stringify(yesterday)}`
  : `Today's date: ${today}. There is no prior edition.`;

const tools = [
  // Server-side web search — Anthropic's infrastructure executes the actual
  // searches; we just get results back as part of the response. If this
  // tool type 404s/400s, check the current type string in Anthropic's docs.
  { type: 'web_search_20250305', name: 'web_search', max_uses: 12 },
  { name: 'save_edition', description: "Save the finished day's Stack Wire edition.", input_schema: EDITION_SCHEMA },
];

async function callClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      tools,
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API request failed (${res.status}): ${body.slice(0, 1000)}`);
  }
  return res.json();
}

let messages = [{ role: 'user', content: userContent }];
let edition = null;

for (let turn = 0; turn < 6 && !edition; turn++) {
  console.log(`Requesting turn ${turn + 1}...`);
  const response = await callClaude(messages);

  const saveCall = response.content.find((b) => b.type === 'tool_use' && b.name === 'save_edition');
  if (saveCall) {
    edition = saveCall.input;
    break;
  }

  messages.push({ role: 'assistant', content: response.content });

  if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
    // Claude stopped without calling save_edition yet — nudge it to finish.
    messages.push({
      role: 'user',
      content: 'Please finish now by calling save_edition with the complete edition.',
    });
  }
  // If stop_reason is anything else (e.g. mid-search), just loop and let it continue.
}

if (!edition) {
  console.error('Claude never called save_edition after 6 turns. Dumping last response for debugging:');
  console.error(JSON.stringify(messages[messages.length - 1], null, 2).slice(0, 4000));
  process.exit(1);
}

const outPath = `${CONTENT_DIR}${today}.json`;
writeFileSync(outPath, JSON.stringify(edition, null, 2));
console.log(`Wrote content/${today}.json`);
