# Stack Wire

Daily tech briefing. The entire pipeline — research, narration, and
deployment — runs inside GitHub Actions on its own schedule. Nothing needs
to be running on your computer, and no credential ever has to pass through
a chat session to make it happen.

## How the pieces fit together

```
scripts/generate-content.mjs  -- calls Anthropic (Claude + web search),
                                  needs ANTHROPIC_API_KEY
        |
        v
content/2026-09-18.json       <- committed back to the repo automatically
        |
        v
scripts/generate-audio.mjs    -- calls OpenAI TTS, needs OPENAI_API_KEY
        |
        v
audio/2026-09-18.mp3
        |
        v
scripts/build-site.mjs        -- pure templating, no secrets
        |
        v
dist/index.html                -> deployed to GitHub Pages
```

All of this runs as one GitHub Actions workflow (`.github/workflows/deploy.yml`)
on a daily cron schedule. Both API keys are read from the environment only —
neither is ever written to a file this repo tracks, logged, or present in
the built `dist/` output.

## One-time setup

1. **Add both secrets.** Repo → *Settings → Secrets and variables → Actions
   → New repository secret*:
   - `ANTHROPIC_API_KEY` — powers the daily research step
   - `OPENAI_API_KEY` — powers the narration step
2. **Turn on Pages.** Repo → *Settings → Pages → Build and deployment →
   Source* → **GitHub Actions**.
3. **Confirm Actions can push.** Repo → *Settings → Actions → General →
   Workflow permissions* → **Read and write permissions**. (The workflow
   needs this to commit each day's generated content back to the repo.)
4. Trigger the workflow once manually from the *Actions* tab
   (**Run workflow**) to confirm it works end to end, rather than waiting
   for the first scheduled run.

From then on it fires daily on its own (see the `cron:` line in
`.github/workflows/deploy.yml` — currently 14:00 UTC, edit to taste) with
no further action needed.

## Running it locally (optional, for testing)

```bash
cp .env.example .env          # fill in your real keys — .env is gitignored, never committed
npm run research               # calls Anthropic, writes content/<date>.json
npm run narrate                 # calls OpenAI, writes audio/<date>.mp3
npm run build                    # renders content/<date>.json -> dist/index.html
npm run dev                       # build + serve dist/ locally
```

Each step works independently — `npm run build` alone still works even if
you haven't run `research`/`narrate` first; the page just shows placeholder
text or skips the audio player for whatever's missing.

## Security notes

- `.env` is gitignored from the very first commit. If it's ever
  accidentally committed, treat both keys as burned — rotate them
  immediately, since removing a file from a later commit does **not**
  remove it from git history.
- Consider a dedicated API key for each service, used only for this
  project, with a monthly spend cap set in that provider's dashboard, so a
  worst case (leak, bug, runaway loop) is bounded.
- Both GitHub Actions secrets are encrypted at rest and only decrypted
  inside the ephemeral runner for a workflow run — never visible in logs
  (GitHub automatically redacts a secret's literal value if it's ever
  printed) and never reach this repo's committed files.
- The research step's model/tool versions (`ANTHROPIC_MODEL`, the
  `web_search_20250305` tool type) may drift out of date over time — see
  `.env.example` and the comments in `scripts/generate-content.mjs` for
  where to update them if a run starts failing.
