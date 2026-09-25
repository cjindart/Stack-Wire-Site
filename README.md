# Stack Wire

Daily tech briefing. Research runs as a scheduled Claude Code routine (under
the user's own Claude plan, not a metered API key); narration, build, and
deployment run inside GitHub Actions, triggered by that routine's push.
Nothing needs to be running on your computer for either half to fire.

## How the pieces fit together

```
Claude Code routine ("Stack Wire daily research", ~5am Pacific cron)
  -- does its own web research, no Anthropic API key involved
        |
        v
content/2026-09-18.json       <- committed and pushed to main by the routine
        | (push triggers .github/workflows/deploy.yml)
        v
scripts/generate-audio.mjs    -- calls OpenAI TTS, needs OPENAI_API_KEY
        |
        v
audio/2026-09-18.mp3          <- committed back to the repo by the workflow
        |
        v
scripts/build-site.mjs        -- pure templating, no secrets
        |
        v
dist/index.html                -> deployed to GitHub Pages
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) only fires on a
push to `content/**.json` or `scripts/**`, or a manual `workflow_dispatch` —
there's no cron in GitHub anymore, since research is what used to drive the
daily timing and that now lives in the Claude routine instead. The `OPENAI_API_KEY`
secret is read from the environment only — never written to a file this repo
tracks, logged, or present in the built `dist/` output.

`scripts/generate-content.mjs` (the old Anthropic-API research script) is
still in the repo and still works via `npm run research` for local/manual use
or as a fallback — it's just no longer what runs automatically.

## One-time setup

1. **Add the OpenAI secret.** Repo → *Settings → Secrets and variables →
   Actions → New repository secret*: `OPENAI_API_KEY` — powers the narration
   step. (`ANTHROPIC_API_KEY` is only needed if you fall back to running
   `scripts/generate-content.mjs` yourself — the daily routine doesn't use it.)
2. **Turn on Pages.** Repo → *Settings → Pages → Build and deployment →
   Source* → **GitHub Actions**.
3. **Confirm Actions can push.** Repo → *Settings → Actions → General →
   Workflow permissions* → **Read and write permissions**. (The workflow
   needs this to commit each day's generated narration back to the repo.)
4. **The research side is a Claude Code routine**, not part of this repo's
   config — manage it at https://claude.ai/code/routines (list/pause/edit
   its schedule or prompt there).
5. Trigger the GitHub workflow once manually from the *Actions* tab
   (**Run workflow**) to confirm narration/build/deploy works end to end,
   rather than waiting for the routine's first push.

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
- `scripts/generate-content.mjs`'s model/tool versions (`ANTHROPIC_MODEL`,
  the `web_search_20250305` tool type) may drift out of date over time — see
  `.env.example` and the comments in that file for where to update them if
  you ever fall back to running it directly.
