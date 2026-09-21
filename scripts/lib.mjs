import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_DIR = fileURLToPath(new URL('../content/', import.meta.url));

// Finds the most recent content/YYYY-MM-DD.json file, or a specific one if a
// filename is passed on the command line (npm run build -- 2026-09-18).
export function loadTodaysContent(argDate) {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) throw new Error('No content/*.json files found — nothing to build.');
  const target = argDate ? `${argDate}.json` : files[files.length - 1];
  if (!files.includes(target)) throw new Error(`content/${target} not found.`);
  const raw = readFileSync(join(CONTENT_DIR, target), 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.categories) || !data.categories.length) {
    throw new Error(`content/${target} has no "categories" — it looks incomplete or malformed. ` +
      'Re-run "npm run research" for that date, or fix the file by hand.');
  }
  if (!data.archive || !Array.isArray(data.archive.items)) {
    throw new Error(`content/${target} is missing "archive.items" — it looks incomplete or malformed.`);
  }
  return { data, filename: target, slug: target.replace(/\.json$/, '') };
}

// Same "make numbers/symbols read naturally" cleanup used by the in-browser
// fallback reader — keep the two in sync if you change one.
export function cleanForSpeech(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\$([\d.,]+)\s*B\b/gi, '$1 billion dollars')
    .replace(/\$([\d.,]+)\s*M\b/gi, '$1 million dollars')
    .replace(/¥([\d.,]+)\s*B\b/gi, '$1 billion yen')
    .replace(/¥([\d.,]+)\s*M\b/gi, '$1 million yen')
    .replace(/€([\d.,]+)\s*B\b/gi, '$1 billion euros')
    .replace(/€([\d.,]+)\s*M\b/gi, '$1 million euros')
    .replace(/£([\d.,]+)\s*B\b/gi, '$1 billion pounds')
    .replace(/£([\d.,]+)\s*M\b/gi, '$1 million pounds')
    .replace(/\$/g, 'dollars ')
    .replace(/¥/g, 'yen ')
    .replace(/€/g, 'euros ')
    .replace(/£/g, 'pounds ')
    .replace(/%/g, ' percent')
    .replace(/&/g, ' and ')
    .replace(/—/g, ', ')
    .trim();
}

// Builds the full spoken script for one day's edition as a single string,
// plus a list of {label, startChar, endChar} markers so the page can show
// "now playing: <headline>" against the single combined audio file.
export function buildScript(data) {
  let text = `Stack Wire, ${data.date}. Here is today's briefing. `;
  const markers = [{ label: "Today's briefing", start: 0 }];

  for (const cat of data.categories) {
    text += `${cat.kicker}. `;
    for (const story of cat.stories) {
      markers.push({ label: story.headline, start: text.length });
      let seg = story.headline + '. ';
      if (story.callback) seg += story.callback + ' ';
      for (const p of story.body) seg += p + ' ';
      text += cleanForSpeech(seg) + ' ';
    }
  }

  text += `That's Stack Wire for ${data.date}.`;
  return { text: text.trim(), markers };
}

// Splits long text into <= maxLen chunks on sentence boundaries so each piece
// stays under the TTS API's per-request input limit.
export function chunkText(text, maxLen = 3500) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
