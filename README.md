# Luma Production Engine

> The first AI-native production system for Luma Dream Machine.
> Concept to finished ad in under an hour.

---

## What Is This?

Luma Production Engine wraps a professional-grade creative pipeline around the Luma Dream Machine API. It doesn't just automate generation — **it directs it**.

The gap it closes: Luma Dream Machine is extraordinarily powerful but has no creative brief layer. You type a prompt and hope. The Production Engine runs a 5-stage Claude AI pipeline before a single generation fires, producing a complete production brief with emotional arc, shot-by-shot creative direction, and an AI Auteur that reads the full brief and assigns camera language the way a director of photography would.

**The result:** a 15-second ad — properly written, properly shot, properly finished — in under an hour.

---

## Pipeline Architecture

```
CONCEPT (raw creative intent)
    ↓
PRODUCTION ENGINE (Claude AI — 5 stages)
  SCAN    → audience, objective, leverage, risk, tension
  ARC     → emotional shape, floor, pivot image, terminal state
  SHOTS   → per-shot Luma-validated prompts (20-40 words, no dead words)
  VALIDATE→ prompt scoring, auto-fix pass
  SCHEMA  → full production document
    ↓
KEYFRAME DESIGN (Photon — instant, ~4 credits)
  → Design novel objects + characters before animating
  → Eliminates T2V hallucination for invented products/characters
    ↓
AUTEUR (AI Directorial Intelligence)
  → Arc-mapped camera controls per shot (30 presets)
  → 6 director presets: Kubrick / Malick / Wong Kar-wai / Lynch / Fincher / Villeneuve
    ↓
AUTEUR BRAINSTORM (Creative Collaborator)
  → Per-shot arc-aware variation generation
  → Auteur evaluates + selects with directorial rationale
    ↓
GENERATION (Luma API)
  DRAFT    → 540p T2V or I2V from keyframe
  ARC      → Continuous Arc: last_frame[N] chains as frame0[N+1]
  FINAL    → 1080p I2V (draft generation as keyframe)
  PIVOT    → ray-v3-reasoning on the arc's hinge moment
    ↓
POST-CHAIN (automatic per shot)
  → Audio (Luma audio API — from schema audio descriptions)
  → Upscale (720p / 1080p / 4K)
    ↓
STORAGE → data/projects.json (LowDB, disk-persistent, port-independent)
```

---

## Three Modes

| Mode | Description |
|------|-------------|
| **MANUAL** | You are god. Full control over every parameter. |
| **HYBRID** | We are god. AI proposes, you approve each step. |
| **AUTO** | Ok Claude. Full automation with Auteur direction. |

**⚡ FULL AUTO** — one click: draft all → auto-approve → 1080p finals → audio → upscale.

---

## Features

### Auteur System
- **AI Auteur** — Claude reads the complete creative brief, assigns camera controls and HDR settings per shot with arc rationale
- **Director Presets** — Villeneuve (HDR epic scale + crane), Kubrick (cold static precision), Malick (golden hour crane HDR), Wong Kar-wai (handheld warmth HDR), Lynch (uncanny static standard), Fincher (cold engineered push)
- Arc position drives camera choice: floor → pullout, pivot → pushin, terminal → crane
- Per-shot override with inherited/overridden field display

### Auteur Brainstorm (Creative Collaborator)
- Generates 4 arc-aware variation directions per shot using Claude
- Evaluates all options against arc position and selects with directorial rationale
- *"For the floor shot — 'Stillness of displacement' deepens immobility before the pivot"*
- One-click apply or manual selection

### Keyframe Design
- Design objects/characters with Photon before animating with Ray3
- Critical for novel objects not in training data (invented products, original characters)
- Shot assignment panel with preview thumbnails
- Proved: designed grass sandal + foot gremlin — consistent and accurate vs T2V hallucination

### Continuous Arc
- Each shot's final frame (`artifact.last_frame`) feeds next shot's `frame0`
- Visual continuity — the world flows rather than cuts
- Toggle per project: **◆ ARC** mode

### Reasoning Pivot
- Auto-detects which shot is the arc's pivot (closest to `pivotPosition`)
- Routes pivot shot through `ray-v3-reasoning` (platform-only model)
- **◆ PIVOT** badge on detected shot
- Maximum generative intelligence on the single most important frame

### Shot Setup Panel
Per-shot controls:
- Model (Ray3.14 / Ray3), Dynamic Range (Standard / HDR)
- Camera Control (30 presets with Luma CDN preview videos)
- Duration, Aspect Ratio, Loop, Enhance toggle
- Audio: positive + negative prompts (auto-populated from schema)
- Post-chain: auto audio → auto upscale → auto extend
- Inherited vs overridden visual diff — amber for auteur-assigned, amber with × for overrides

### Hard Stops
Configurable pause points for artistic direction:
- **After ARC** — review arc shape, pivot, handle before shot generation
- **After SHOTS** — review all prompts before generation
- **Before Generate** — full REVIEW modal with 8-column shot settings table

### Storage
- LowDB → `data/projects.json` on disk
- Port-independent (Vite `strictPort: true`, pinned to 5173)
- Server-accessible — Playwright automation persists generation IDs
- Auto-migrates from `localStorage` on first load

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6, React Router v6 |
| AI | Claude claude-sonnet-4-6 (Anthropic API) |
| Storage | LowDB v7 → `data/projects.json` |
| Video | Luma Dream Machine API (ray-2, ray-flash-2, Photon) |
| Platform | Playwright (persistent session for Unlimited plan features) |
| Styles | Pure CSS-in-JS, JetBrains Mono, zero external UI deps |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Anthropic API key (`sk-ant-...`)
- Luma API key from [lumalabs.ai/api](https://lumalabs.ai/api)
- Luma Unlimited subscription (for platform features — HiFi, Extend, Audio, Reasoning)

### Install

```bash
git clone https://github.com/YOUR_ORG/luma-production-engine
cd luma-production-engine
npm install
npx playwright install chromium
```

### Configure

```bash
cp .env.example .env
# Fill in:
# ANTHROPIC_API_KEY=sk-ant-...
# LUMA_API_KEY=luma-...
```

### Run

```bash
npm run dev
# http://localhost:5173 — port pinned, strictPort: true
```

### Platform Session (Unlimited plan features)

```bash
node -e "
const { chromium } = require('playwright');
chromium.launchPersistentContext('.playwright-session', {
  headless: false,
  viewport: { width: 1280, height: 800 }
}).then(async ctx => {
  const page = await ctx.newPage();
  await page.goto('https://dream-machine.lumalabs.ai/account/subscription');
  console.log('Log in, verify Unlimited shows as Current, then close the browser');
  setTimeout(() => ctx.close(), 300000);
});
"
```

---

## API Routes

### Public (API keys)
```
POST /api/generate              Anthropic Claude pipeline
POST /api/luma/generate         Luma video create
GET  /api/luma/status/:id       Poll generation state
POST /api/luma/image            Photon image generate (sync)
POST /api/luma/audio/:id        Add audio to generation
POST /api/luma/upscale/:id      Upscale generation
```

### Platform (Playwright session)
```
GET  /api/platform/session           Check login state
POST /api/platform/login             Open browser for login
GET  /api/platform/last-frame/:id    Fetch last_frame URL
POST /api/platform/reasoning         Submit with ray-v3-reasoning
POST /api/platform/brainstorm        Call platform Brainstorm
POST /api/platform/char-ref          Submit character reference shot
```

### Storage (LowDB)
```
GET    /api/storage/projects         List projects
GET    /api/storage/projects/:id     Get project
POST   /api/storage/projects         Upsert project
DELETE /api/storage/projects/:id     Delete project
POST   /api/storage/runs/:id         Append run
POST   /api/storage/import           Bulk import (localStorage migration)
```

---

## Directory

```
luma-production-engine/
├── App.jsx                      Root layout, sidebar, character management
├── vite.config.js               Port 5173 pinned, all proxy middlewares
├── data/projects.json           LowDB storage (gitignored, .gitkeep tracks dir)
├── src/
│   ├── lib/
│   │   ├── api.js               Claude API client (3-strategy JSON extraction)
│   │   ├── auteur.js            Director presets, AI auteur, brainstorm, pivot
│   │   ├── camera-controls.js   30 camera presets + CDN preview URLs
│   │   ├── luma-client.js       All Luma API client functions
│   │   ├── pipeline.js          5-stage pipeline orchestrator
│   │   ├── platform-brief.js    HYBRID platform handoff document builder
│   │   ├── schema-builder.js    Plain-text production schema generator
│   │   └── validator.js         Luma prompt validator
│   ├── prompts/                 Claude prompt templates per pipeline stage
│   ├── components/
│   │   ├── KeyframeDesign.jsx   Photon keyframe design panel
│   │   ├── ProjectSettings.jsx  Mode/Auteur/Mood/Energy/HardStops
│   │   ├── SchemaOutput.jsx     Main schema display + generation UI hub
│   │   └── ShotSetup.jsx        Per-shot settings with inherited/override diff
│   ├── pages/
│   │   ├── Dashboard.jsx        Projects grid
│   │   ├── ProjectWorkspace.jsx Full pipeline workspace
│   │   └── RunView.jsx          Run history + side-by-side comparison
│   └── server/
│       ├── db.js                LowDB singleton
│       ├── proxy.js             All API proxy middlewares
│       └── luma-platform.js     Playwright platform automation
└── knowledge/
    ├── LUMA-TECHNICAL.md        Luma API + model reference
    ├── CREATIVE-ENGINE.md       VANTA/STACK creative methodology
    └── VANTA-STACK.md           Full cognitive engine specification
```

---

## Smoke Tests

| Concept | Format | Result |
|---------|--------|--------|
| Luma Translate — 4 untranslatable emotions | 30s | 8 shots, all 100/100, finals rendered |
| Luma Translate — same concept, tighter | 15s | 5 shots, 9:16, FULL AUTO → 2 finals ready |
| LumaSlips grass sandals + foot gremlin | 15s | Photon keyframes: consistent object + character |
| Glenfiddich whiskey pour | 30s | 7 shots, amber light, crystal glass |

---

## Roadmap

- [ ] FFmpeg assembly — download finals → concat → brand card → MP4 delivery
- [ ] Continuous Arc end-to-end test — last_frame chaining in production
- [ ] ray-v3-reasoning pivot — end-to-end test via Playwright
- [ ] Platform Brainstorm — WebSocket capture for native Luma suggestions
- [ ] Scale API tier — ray-3, ray-hdr-3 access (contact Luma enterprise)
- [ ] Auteur hard stop — AI Auteur applies between ARC and SHOTS
- [ ] Multi-format export — 9:16 / 16:9 / 1:1 from single production via Reframe

---

*Built by TrashWizard / Darv0n + Claude Opus 4.6.
VANTA/STACK methodology. Everything in `knowledge/` is the creative bible.*
