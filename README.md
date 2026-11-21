# 🌴 GTA 6 AI Shorts & Reels Multi-Agent Video Platform (`gta6-shorts-ai`)

> **Autonomous 11-Agent Video Editing Engine**: Transforms long-form GTA 6 gameplay recordings into viral, high-engagement 9:16 vertical YouTube Shorts, Instagram Reels, and TikTok clips (`1080×1920`, 30/60 FPS) with dynamic action cropping, certified reaction memes, phonk audio ducking, animated captions, and pre-publication copyright verification.

---

## 🚀 Key Features

- **11 Specialized Autonomous AI Agents**:
  1. **Video Analyzer Agent**: Detects scene cuts, visual motion vectors, and audio energy RMS spikes.
  2. **Highlight Detection Agent**: Classifies gameplay moments into 10 categories (Fails, Stunts, Police Pursuit, Fights, NPC Comedy, etc.) with 1–100 entertainment scores.
  3. **Clip Extraction Agent**: Trims segments (15–60s) with contextual speech buffers.
  4. **Meme Research Agent**: Matches emotional context (Shock, Comedy, Fail, Rage, Triumph) with certified CC0 reaction stickers and PiP overlays.
  5. **Music Selection Agent**: Synchronizes royalty-free Phonk/Synthwave BGM with automatic speech ducking (-16 dB).
  6. **Sound Effects Agent**: Places punches, whooshes, scratches, and comedic impacts on beat.
  7. **Video Editing Agent**: Programmatic 9:16 vertical video composition (`1080×1920`) using FFmpeg with dynamic zoom.
  8. **Subtitle Agent**: Generates word-level animated typography inside mobile-safe areas.
  9. **Copyright Compliance Agent**: Performs pre-publication asset audits (100% legal, zero DRM evasion tricks).
  10. **Quality Assurance Agent**: Verifies black frames, sync alignment, audio clipping, and hook grades.
  11. **Export Agent**: Generates platform-tailored publishing packages for YouTube Shorts, Instagram Reels, and TikTok with viral titles, SEO descriptions, and hashtags.

- **Vice City Cyber Neon UI**:
  - Full-featured dark-mode dashboard with neon cyan and hot pink aesthetics.
  - Interactive 9:16 vertical video player with live cropping, zoom scaling, and audio sliders.
  - Multi-platform packaging and one-click MP4 downloads.
  - Real-time agent execution telemetry stream.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS (Vice City Cyber Neon theme), Lucide Icons.
- **Backend**: Node 24 Built-in `node:sqlite` (`DatabaseSync` with Write-Ahead Logging WAL mode) - 21 normalized tables mirroring Drizzle ORM schemas.
- **Media Processing**: FFmpeg & FFprobe (programmatic filtering: `crop=ih*9/16:ih`, `zoompan`, `overlay`, `amix`, `sidechaincompress`, `blackdetect`, `ebur128`).
- **Asset Vault**: Certified CC0 memes, royalty-free gaming music tracks, and synthesized sound effects.

---

## 🏁 Quick Start

```bash
# 1. Navigate to the project
cd gta6-shorts-ai

# 2. Seed database assets and sample gameplay footage
npm run db:seed

# 3. Test the full 11-agent pipeline end-to-end
node --experimental-strip-types scripts/test-pipeline.mjs

# 4. Start the Production Web Dashboard
npm run start
# Or for development:
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 📁 Project Architecture

```
gta6-shorts-ai/
├── public/
│   ├── assets/              # Certified CC0 memes, royalty-free music, sound effects
│   └── samples/             # 45-second 1080p authorized GTA 6 gameplay sample
├── storage/
│   ├── gta6_shorts.db       # SQLite WAL database (21 normalized tables)
│   ├── clips/               # Rendered 1080x1920 9:16 vertical MP4 shorts
│   └── exports/             # Platform-packaged deliverables (YouTube, Reels, TikTok)
├── src/
│   ├── agents/              # 11 Specialized AI Agents & Master Orchestrator
│   │   ├── 01-video-analyzer.ts
│   │   ├── 02-highlight-detector.ts
│   │   ├── 03-clip-extractor.ts
│   │   ├── 04-meme-researcher.ts
│   │   ├── 05-music-selector.ts
│   │   ├── 06-sound-effects.ts
│   │   ├── 07-video-editor.ts
│   │   ├── 08-subtitle-engine.ts
│   │   ├── 09-copyright-compliance.ts
│   │   ├── 10-quality-assurance.ts
│   │   ├── 11-export-engine.ts
│   │   ├── base-agent.ts
│   │   └── orchestrator.ts
│   ├── app/                 # Next.js 15 Vice City Web Application
│   │   ├── api/             # REST API endpoints (projects, clips, telemetry, streaming)
│   │   ├── agents/          # Agent Fleet Telemetry Command Center
│   │   ├── assets/          # Certified Asset Vault (Memes, Music, SFX)
│   │   ├── compliance/      # Copyright & Content Compliance Center
│   │   ├── editor/          # 9:16 Vertical Video Studio
│   │   ├── export/          # Multi-Platform Publishing Hub
│   │   ├── highlights/      # 10-Category Highlight Explorer
│   │   ├── projects/new/    # New Project Creation Wizard
│   │   ├── projects/[id]/   # Live Agent Swarm Monitor
│   │   ├── layout.tsx       # Vice City Root Navigation Layout
│   │   └── page.tsx         # Executive KPI Dashboard & Showcase
│   ├── db/                  # Database schemas, connections, and repository layer
│   ├── lib/                 # FFmpeg core engine & programmatic composition
│   └── types/               # TypeScript interfaces & data contracts
└── tailwind.config.ts       # Vice City Neon color palette
```

---

## 🛡️ Legal & Copyright Integrity

The platform strictly prohibits and avoids:
1. YouTube Content ID evasion tricks (pitch-shifting, speed manipulation, horizontal flipping to confuse algorithms).
2. Unauthorized stream ripping or DRM circumvention.
3. Unlicensed commercial music or copyrighted movie/TV footage.

All exported packages include a comprehensive compliance certificate and full attribution ledger for safe monetization.
