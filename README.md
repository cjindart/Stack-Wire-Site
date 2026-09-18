# Stack Wire

Daily tech briefing. Editorial content is researched and written by Claude
each morning; this repo turns that content into a narrated, hosted static
site with real OpenAI text-to-speech audio.

## How the pieces fit together

```
content/2026-09-18.json   <- today's stories (Claude writes/pushes this)
        |
        v
scripts/generate-audio.mjs  -- calls OpenAI TTS, needs OPENAI_API_KEY --> audio/2026-09-18.mp3
        |
        v
scripts/build-site.mjs      -- pure templating, no secrets --> dist/index.html
```

The `OPENAI_API_KEY` is read from the environment only. It is never written
to any file this repo tracks, never logged, and never present in the built
`dist/` output — only the finished MP3 lives there.

## One-time setup (you do this, in GitHub's UI — Claude can't)

1. **Create the repo.** Push this folder to a new GitHub repo (public is
   fine — nothing secret is ever committed; see `.gitignore`).
2. **Add the secret.** Repo → *Settings → Secrets and variables → Actions →
   New repository secret* → name it `OPENAI_API_KEY` → paste your key.
   This is the only place your key lives besides your own machine and
   OpenAI's own servers.
3. **Turn on Pages.** Repo → *Settings → Pages → Build and deployment →
   Source* → select **GitHub Actions**.
4. Push to `main` (or run the workflow manually from the *Actions* tab).
   The site publishes to `https://<you>.github.io/<repo>/`.

From then on, every push that touches `content/**.json` re-narrates and
redeploys automatically — no local step, no laptop needing to be awake.

## Running it locally (optional, for testing)

```bash
cp .env.example .env        # fill in your real key — .env is gitignored, never committed
npm run narrate              # calls OpenAI, writes audio/<date>.mp3
npm run build                 # renders content/<date>.json -> dist/index.html
npm run dev                   # build + serve dist/ locally
```

`npm run build` alone (no `narrate` first) still works — the page just
shows a "narration not generated yet" note in place of the audio player.

## Adding a new day's edition

Drop a new `content/YYYY-MM-DD.json` file (same shape as the existing one —
see the file in this repo for the exact fields) and push it. Both scripts
always pick the most recent file in `content/` by filename, so no other
file needs to change.

## Security notes

- `.env` is gitignored from the very first commit. If it's ever
  accidentally committed, treat the key as burned — rotate it at
  platform.openai.com immediately, since removing a file from a future
  commit does **not** remove it from git history.
- Consider a dedicated OpenAI API key used only for this project, with a
  monthly spend cap set in the OpenAI dashboard, so a worst case (leak,
  bug, runaway loop) is bounded.
- The GitHub Actions secret is encrypted at rest and only decrypted inside
  the ephemeral runner for a workflow run — it's never visible in logs
  (GitHub automatically redacts a secret's literal value if it ever gets
  printed) and never reaches this repo's committed files.
