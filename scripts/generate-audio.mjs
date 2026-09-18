#!/usr/bin/env node
// Calls OpenAI's text-to-speech API to narrate one day's edition.
//
// Reads OPENAI_API_KEY from the environment ONLY — it is never hardcoded,
// never logged, and never written to any output file. Locally that env var
// comes from a .env file (gitignored, never committed); in CI it comes from
// the repo's GitHub Actions secret. Either way this script never prints the
// key's value.
//
// Usage:
//   OPENAI_API_KEY=sk-... node scripts/generate-audio.mjs [YYYY-MM-DD]
//   node scripts/generate-audio.mjs --force   (re-narrate even if audio/<slug>.mp3 exists)
//
// Output: audio/<slug>.mp3  (one combined narration file for that edition,
// committed to the repo — see .gitignore's note on why)
//
// IDEMPOTENT BY DESIGN: if audio/<slug>.mp3 already exists, this exits
// immediately without calling OpenAI at all. That's what makes a UI-only
// push (editing scripts/build-site.mjs, CSS, etc.) safe to push straight to
// the deployed workflow — the narrate step still runs, but does nothing
// (and costs nothing) when the day's audio was already generated.

import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadTodaysContent, buildScript, chunkText } from './lib.mjs';

const force = process.argv.includes('--force') || process.env.FORCE_NARRATE === '1';
const argDate = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined;
const { data, slug } = loadTodaysContent(argDate);
const outPath = `audio/${slug}.mp3`;

if (existsSync(outPath) && !force) {
  console.log(`audio/${slug}.mp3 already exists — skipping narration (no OpenAI call made). ` +
    'Pass --force to regenerate it anyway.');
  process.exit(0);
}

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('OPENAI_API_KEY is not set. Put it in a local .env (see .env.example) ' +
    'or, in CI, add it as a GitHub Actions secret named OPENAI_API_KEY.');
  process.exit(1);
}

// Change these if you'd rather use a different OpenAI TTS model/voice —
// check https://platform.openai.com/docs/guides/text-to-speech for the
// current model names, voices, and pricing (both can change).
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';

const { text } = buildScript(data);
const chunks = chunkText(text);

mkdirSync('audio', { recursive: true });

console.log(`Narrating ${slug} — ${chunks.length} chunk(s), ${text.length} characters total.`);

const chunkFiles = [];
for (let i = 0; i < chunks.length; i++) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: chunks[i] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI TTS request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const path = `audio/_chunk-${i}.mp3`;
  writeFileSync(path, buf);
  chunkFiles.push(path);
  console.log(`  chunk ${i + 1}/${chunks.length} done (${buf.length} bytes)`);
}

if (chunkFiles.length === 1) {
  execFileSync('mv', [chunkFiles[0], outPath]);
} else {
  // Concatenate chunks into one seamless file with ffmpeg (preinstalled on
  // GitHub-hosted runners; install it locally if you don't have it). All
  // paths here are relative to audio/, since ffmpeg runs with that as cwd.
  const listPath = 'audio/_concat-list.txt';
  writeFileSync(listPath, chunkFiles.map((f) => `file '${f.split('/').pop()}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', '_concat-list.txt', '-c', 'copy', `${slug}.mp3`], { cwd: 'audio' });
  unlinkSync(listPath);
  for (const f of chunkFiles) if (existsSync(f)) unlinkSync(f);
}

console.log(`Wrote ${outPath}`);
