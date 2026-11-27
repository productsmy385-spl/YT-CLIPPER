# GTA 6 AI Shorts Creator (`gta6-shorts-ai`)

Turns long gameplay videos into short-form clips. Paste a **public YouTube link** or upload a
video; six AI agents find the best moments, cut them into shorts with captions, and render MP4s you can edit in the
browser and re-render.

## Workflow

```
YouTube link (public) ──────┐
                             ├─► acquire ─► validate (FFprobe) ─► 6 agents ─► shorts ─► editor ─► FFmpeg render ─► download
Upload (MP4/MOV/WebM/MKV) ───┘
```

1. **Audio Intelligence**: loudness, silences, Gemini transcript and sound events.
2. **Video Analysis**: FFmpeg scene changes and black frames, Gemini visual events.
3. **Highlight Detection**: ranks moments and snaps start/end to sentence and scene boundaries.
4. **Shorts Generation**: removes dead air and picks framing, producing one edit document per short.
5. **Captions**: synchronised cues from the transcript, keyword highlighting, Telugu/Devanagari font fallback.
6. **Quality Control**: checks the rendered file (duration, resolution, A/V sync, decode errors, black frames, silence,
   subtitle timing) and rejects broken output.

Every agent run is recorded in `agent_execution_logs`. If the AI is unavailable, the agents fall back to measured
signals and the UI says so. Captions are never invented.

### YouTube links
YouTube's API returns metadata only; the video itself is fetched with yt-dlp. Any public or unlisted video can be
processed. Private, members-only and age-restricted videos cannot (that would need a signed-in account).
`YOUTUBE_ACQUISITION=owned` limits fetching to your connected channel, and `off` disables it.
Downloading other channels' videos is against YouTube's Terms of Service, and re-posting their content can bring
Content ID claims, so the responsibility rests with the operator.

## Running locally

```bash
npm ci
cp .env.example .env    # fill in GEMINI_API_KEY, Google OAuth, TOKEN_ENCRYPTION_KEY. Do NOT point DATABASE_URL at production
npm run dev             # http://localhost:3000
```

Requires FFmpeg/FFprobe on PATH, plus yt-dlp (only for fetching from your own channel).

## Working from your PC with production

YouTube blocks video downloads from datacenter IPs such as Railway's, while your home connection works. Two features
connect your PC to production. Both need the same `SYNC_TOKEN` on Railway and in your PC's `.env`, plus
`PRODUCTION_URL` on the PC.

- **Fetch helper.** Paste YouTube links on the production site. With `YOUTUBE_FETCH_VIA=helper` on Railway, the
  project waits in *Acquiring video* until you run `npm run fetch-helper` on your PC. The helper downloads each waiting
  video with yt-dlp and uploads it. Production then runs the AI agents, rendering and QC itself. Keep the helper
  window open while you work, or use `npm run fetch-helper -- --once` for a single pass.
- **Send to production.** A finished project in the local app shows a *Send to production* button. It uploads the
  project's files, then its rows, and production serves the copy (editing and re-rendering included). Sending again
  replaces production's copy. Changes made on production do not flow back. With `AUTO_SYNC_TO_PRODUCTION=true` the
  local server does this by itself every 30 s for any finished project whose shorts changed (new project, editor save,
  re-render). The project page shows whether production is up to date.

Local runs should set `POSTGRES_DISABLED=true` (or leave `DATABASE_URL` empty) so they never write to production's
database.

## Tests

```bash
node --test scripts/test-units.mjs                                    # pure logic
TEST_DATABASE_URL=postgresql://... node scripts/test-db-durability.mjs # restart survival (use a throwaway DB)
node scripts/test-pipeline-e2e.mjs <video.mp4>                        # full engine, isolated storage, real FFmpeg + Gemini
```

## Architecture

- `src/pipeline/`: agents and the orchestrating pipeline (`pipeline.ts`, `stages.ts`).
- `src/lib/jobs/`: durable job queue and background worker (started by `src/instrumentation-node.ts`).
- `src/lib/render/`: edit document, ASS caption generation, and the FFmpeg renderer.
- `src/lib/media/ff.ts`: async FFmpeg/FFprobe toolkit. `src/lib/ai/gemini.ts`: Gemini client.
- `src/lib/youtube/`: OAuth connection (`oauth.ts`) and owned-video acquisition (`media-source.ts`).
- `src/db/`: SQLite working copy replicated to PostgreSQL (`postgres.ts`).

## Deployment (Railway)
Docker build, single replica, health check `/api/health`. Attach a volume at `/app/storage`, set `APP_PASSWORD`,
`DATABASE_URL`, `TOKEN_ENCRYPTION_KEY` (never change it), and the Google/Gemini keys listed in `.env.example`.
Put the Google OAuth consent screen into **In production**; in Testing mode Google expires refresh tokens after 7 days.
