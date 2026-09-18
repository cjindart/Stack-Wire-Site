#!/usr/bin/env node
// Renders content/<date>.json into a self-contained index.html, reusing the
// same visual design as the original Stack Wire Claude Artifact. Pure
// templating — no secrets, no network calls. Safe to run anywhere, including
// locally with no .env at all.
//
// Usage: node scripts/build-site.mjs [YYYY-MM-DD]
// Output: dist/index.html  (+ copies the matching audio/<slug>.mp3 in if present)

import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { loadTodaysContent, buildScript } from './lib.mjs';

// --- design tokens, copied from the original Stack Wire template ---------
const TEMPLATE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,500&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --paper: #eef1f4; --paper-raised: #ffffff; --ink: #1b2230; --ink-soft: #4c5566; --ink-faint: #7c8494;
    --rule: #cdd4dd; --accent: #a85a1c; --accent-ink: #7a4210; --accent-soft: #a85a1c1c; --teal: #2c6e6b;
    --yesterday-bg: #e6e2d8; --yesterday-ink: #5c5647; --yesterday-rule: #d3ccb9;
    --shadow: 0 1px 2px rgba(27,34,48,0.06), 0 8px 24px rgba(27,34,48,0.05); --focus: #2c6e6b;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #10131a; --paper-raised: #171b24; --ink: #e8eaef; --ink-soft: #a8afbd; --ink-faint: #6b7386;
      --rule: #2a3040; --accent: #e0973f; --accent-ink: #f2b874; --accent-soft: #e0973f26; --teal: #6bbab6;
      --yesterday-bg: #1c1f27; --yesterday-ink: #9b9584; --yesterday-rule: #33362f;
      --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.35); --focus: #6bbab6;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: 'Public Sans', ui-sans-serif, system-ui, sans-serif; padding: 32px 20px 64px; line-height: 1.55; }
  a { color: var(--teal); }
  .wrap { max-width: 980px; margin: 0 auto; }
  .masthead { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; border-bottom: 3px solid var(--ink); padding-bottom: 14px; margin-bottom: 6px; }
  .masthead-title { font-family: 'Newsreader', Georgia, serif; font-weight: 600; font-size: clamp(2.1rem, 5vw, 3.1rem); margin: 0; }
  .masthead-title .dot { color: var(--accent); }
  .masthead-meta { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--ink-soft); text-align: right; line-height: 1.7; }
  .masthead-tagline { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.1em; padding: 10px 0 22px; border-bottom: 1px solid var(--rule); margin-bottom: 22px; }
  .listen-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; background: var(--paper-raised); border: 1px solid var(--rule); border-radius: 8px; padding: 14px 16px; margin-bottom: 28px; box-shadow: var(--shadow); }
  .listen-bar--missing { color: var(--ink-faint); font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; }
  .listen-bar audio { width: 100%; }
  .chapters-toggle { width: 100%; }
  .chapters-toggle summary { list-style: none; font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint); cursor: pointer; padding: 4px 0; user-select: none; }
  .chapters-toggle summary::-webkit-details-marker { display: none; }
  .chapters-toggle summary::before { content: "▸ "; display: inline-block; transition: transform 0.15s ease; }
  .chapters-toggle[open] summary::before { transform: rotate(90deg); }
  .chapters-toggle summary:hover { color: var(--accent-ink); }
  .chapters { display: flex; flex-wrap: wrap; gap: 6px; width: 100%; padding-top: 8px; }
  .chapter-btn { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; background: var(--paper); color: var(--ink-soft); border: 1px solid var(--rule); border-radius: 4px; padding: 4px 8px; cursor: pointer; }
  .chapter-btn:hover { color: var(--accent-ink); border-color: var(--accent); }
  .listen-note { font-family: 'JetBrains Mono', monospace; font-size: 0.64rem; color: var(--ink-faint); width: 100%; }
  .edition { display: grid; grid-template-columns: 200px 1fr; gap: 40px; align-items: start; }
  .index { position: sticky; top: 20px; display: flex; flex-direction: column; gap: 2px; }
  .index-label { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-faint); margin-bottom: 8px; }
  .index a { font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; color: var(--ink-soft); text-decoration: none; padding: 6px 0; border-bottom: 1px solid var(--rule); }
  .index .count { color: var(--ink-faint); margin-left: 6px; }
  @media (max-width: 720px) { .edition { grid-template-columns: 1fr; gap: 24px; } .index { position: static; } }
  section.category { padding-block: 26px; border-bottom: 1px solid var(--rule); }
  section.category:first-child { padding-top: 0; }
  .category-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px; }
  .category-head .kicker { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-ink); background: var(--accent-soft); padding: 3px 8px; border-radius: 3px; }
  .category-head h2 { font-family: 'Newsreader', serif; font-weight: 500; font-style: italic; font-size: 1rem; color: var(--ink-faint); margin: 0; }
  .story { padding-block: 14px; }
  .story + .story { border-top: 1px dashed var(--rule); }
  .story h3 { font-family: 'Newsreader', serif; font-weight: 600; font-size: 1.32rem; line-height: 1.28; margin: 0 0 8px; }
  .story p { margin: 0 0 8px; color: var(--ink-soft); max-width: 66ch; }
  .story .src { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--ink-faint); }
  .story .src a { color: var(--ink-faint); }
  .callback { display: inline-flex; gap: 6px; align-items: baseline; font-size: 0.85rem; color: var(--teal); background: color-mix(in srgb, var(--teal) 10%, transparent); border-left: 2px solid var(--teal); padding: 6px 10px; margin: 4px 0 10px; border-radius: 0 3px 3px 0; }
  .callback .tag { font-family: 'JetBrains Mono', monospace; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; }
  .archive { margin-top: 40px; background: var(--yesterday-bg); border: 1px solid var(--yesterday-rule); border-radius: 6px; padding: 22px 24px; }
  .archive-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--yesterday-rule); }
  .archive-head h2 { font-family: 'Newsreader', serif; font-style: italic; font-weight: 500; font-size: 1.15rem; color: var(--yesterday-ink); margin: 0; }
  .archive-head .date { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--yesterday-ink); opacity: 0.8; }
  .archive ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .archive li { color: var(--yesterday-ink); font-size: 0.92rem; padding-left: 16px; position: relative; }
  .archive li::before { content: "—"; position: absolute; left: 0; opacity: 0.6; }
  .archive li b { color: var(--ink); font-weight: 600; }
  footer { max-width: 980px; margin: 40px auto 0; font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: var(--ink-faint); text-align: center; }
`;

const argDate = process.argv[2];
const { data, slug } = loadTodaysContent(argDate);
const { markers } = buildScript(data);

const CHARS_PER_SEC = 14; // rough speaking-rate estimate, for chapter markers only
const chapters = markers.map((m) => ({ ...m, seconds: Math.round(m.start / CHARS_PER_SEC) }));

const audioPath = `audio/${slug}.mp3`;
const hasAudio = existsSync(audioPath);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function renderStory(story) {
  const callback = story.callback
    ? `<div class="callback"><span class="tag">Thread</span> ${esc(story.callback)}</div>`
    : '';
  const body = story.body.map((p) => `<p>${esc(p)}</p>`).join('\n          ');
  const sources = story.sources
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`)
    .join(', ');
  return `
        <div class="story">
          <h3>${esc(story.headline)}</h3>
          ${callback}
          ${body}
          <p class="src">Source: ${sources}</p>
        </div>`;
}

function renderCategory(cat) {
  const stories = cat.stories.map(renderStory).join('\n');
  return `
      <section class="category" id="${esc(cat.id)}">
        <div class="category-head"><span class="kicker">${esc(cat.kicker)}</span><h2>${esc(cat.subhead)}</h2></div>
${stories}
      </section>`;
}

function renderIndex(categories) {
  return categories
    .map((c) => `<a href="#${esc(c.id)}">${esc(c.kicker)} <span class="count">${c.stories.length}</span></a>`)
    .join('\n      ');
}

function renderArchive(archive) {
  const items = archive.items
    .map((i) => `<li><b>${esc(i.category)}:</b> ${esc(i.text)}</li>`)
    .join('\n      ');
  return `
  <div class="archive">
    <div class="archive-head">
      <h2>Previous edition</h2>
      <span class="date">${esc(archive.date)}</span>
    </div>
    <ul>
      ${items}
    </ul>
  </div>`;
}

function renderPlayer() {
  if (!hasAudio) {
    return `<div class="listen-bar listen-bar--missing">Audio narration hasn't been generated for this edition yet — run <code>npm run narrate</code>.</div>`;
  }
  const chapterButtons = chapters
    .map((c) => `<button class="chapter-btn" data-seconds="${c.seconds}">${esc(c.label)}</button>`)
    .join('\n        ');
  return `
  <div class="listen-bar">
    <audio id="sw-audio" controls preload="none" src="${audioPath}"></audio>
    <details class="chapters-toggle">
      <summary>Chapters (${chapters.length})</summary>
      <div class="chapters" id="sw-chapters">
        ${chapterButtons}
      </div>
    </details>
    <div class="listen-note">Narrated with OpenAI text-to-speech. Chapter jumps are estimated from script length, not exact.</div>
  </div>
  <script>
    (function () {
      var audio = document.getElementById('sw-audio');
      var chaptersEl = document.getElementById('sw-chapters');
      if (!audio || !chaptersEl) return;
      chaptersEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.chapter-btn');
        if (!btn) return;
        audio.currentTime = Number(btn.dataset.seconds) || 0;
        audio.play();
      });
    })();
  </script>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stack Wire</title>
<style>
${TEMPLATE_CSS}
</style>
</head>
<body>
<div class="wrap">
  <div class="masthead">
    <h1 class="masthead-title">Stack Wire<span class="dot">.</span></h1>
    <div class="masthead-meta">
      VOL. ${esc(data.vol)} &middot; NO. ${esc(data.no)}<br>
      <span id="sw-date">${esc(data.date)}</span>
    </div>
  </div>
  <div class="masthead-tagline">${esc(data.tagline)}</div>
${renderPlayer()}
  <div class="edition">
    <nav class="index" aria-label="Today's sections">
      <div class="index-label">Today</div>
      ${renderIndex(data.categories)}
    </nav>
    <div class="stories">
${data.categories.map(renderCategory).join('\n')}
    </div>
  </div>
${renderArchive(data.archive)}
  <footer>STACK WIRE — AUTOMATED DAILY BRIEFING</footer>
</div>
</body>
</html>
`;

mkdirSync('dist/audio', { recursive: true });
writeFileSync('dist/index.html', html);
if (hasAudio) copyFileSync(audioPath, `dist/${audioPath}`);

console.log(`Wrote dist/index.html${hasAudio ? ` and dist/${audioPath}` : ' (no audio yet)'}`);
