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
//
// Output: audio/<slug>.mp3  (one combined narration file for that edition)

import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadTodaysContent, buildScript, chunkText } from './lib.mjs';

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

const argDate = process.argv[2];
const { data, slug } = loadTodaysContent(argDate);
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

const outPath = `audio/${slug}.mp3`;

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
