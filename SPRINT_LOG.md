# Sprint Log

## Sprint 01 — Foundation (2026-03-15)

**Status:** Complete

### Built
- Phase 1A: Scaffold (Vite 6 + React 18, no external UI libs)
- Phase 1B: API Proxy (Anthropic key server-side, never in client bundle)
- Phase 1C: Component extraction from monolith (PipelineProgress, LiveResults, SchemaOutput)
- Phase 1D: App wiring — full pipeline runs end-to-end
- Phase 2A: Project data model (Project → runs[], never overwrite, append)
- Phase 2B: Save/load UI — sidebar, auto-save after run, project persistence
- Phase 2C: Shot-level re-run with frozen scan+arc context (P12)
- Phase 2D: Character reference workflow (sidebar, @name tagging, auto-Ray3)
- Phase 3A: Platform layer — React Router, dashboard, run comparison, export

### Key decisions
- `luma-engine-v2.jsx` kept as source of truth monolith (DO NOT MODIFY)
- `storage.js` abstract from day 1 — localStorage → LowDB migration later
- `runs[]` never overwrites — always appends (P12 decision)

---

## Sprint 02 — Luma API Integration (2026-03-15)

**Status:** Complete

### Built
- Luma API proxy (`/api/luma/generate`, `/api/luma/status/:id`)
- Three modes: SCHEMA / DRAFT API / HYBRID
- Draft generation (540p T2V) with per-shot status machine
- HYBRID mode: approve drafts → 1080p I2V finals (draft as `frame0`)
- Auto-approve chain in FULL AUTO
- Post-chain: audio (`/api/luma/audio/:id`) + upscale (`/api/luma/upscale/:id`)
- Platform brief export (generation IDs for char ref handoff)
- REVIEW modal before generation execution
- ⚡ FULL AUTO: one click → draft → approve → final → audio → upscale

### Key discoveries
- Public API models: `ray-2` (Ray3), `ray-flash-2` (Ray3.14)
- `ray-3`, `ray-hdr-3`: valid names but "no access" — require Scale API tier
- `ray-v3-reasoning`: platform-only
- Audio endpoint: returns NEW video URL with audio baked in (not separate file)
- Upscale 4K: only 44 credits vs 42 for 1080p
- Platform operations (HiFi, Extend, etc.) require non-Draft quality

### Smoke test
- Glenfiddich whiskey pour — 7 shots, 12,880 credits, all 100/100
- Dog on window — 1080p final rendered, inline video preview

---

## Sprint 03 — Storage + Auteur + Brainstorm (2026-03-15)

**Status:** Complete

### Built

**LowDB Storage:**
- `src/server/db.js` — LowDB v7 sync singleton
- `data/projects.json` — disk-persistent, port-independent
- `/api/storage/*` REST endpoints
- Auto-migrate from localStorage on first load
- Port pinned to 5173 (`strictPort: true`)

**ProjectSettings:**
- Mode: MANUAL / HYBRID / AUTO
- Auteur: None / AI / 6 director presets
- Mood + Energy
- Hard stops: afterArc, afterShots, beforeGenerate
- Shot defaults cascading

**AI Auteur:**
- Reads full creative brief (arc, beats, handle, pivotImage)
- Assigns camera controls + dynamic range per shot
- Director presets: Kubrick, Malick, Wong Kar-wai, Lynch, Fincher, Villeneuve
- Arc position mapping (opening→aerial, floor→pullout, pivot→pushin)

**ShotSetup:**
- 30 camera presets with CDN preview videos
- HDR toggle, enhance toggle
- Post-chain configuration per shot
- Inherited vs overridden field display (amber = auteur, × = reset)

**Keyframe Design:**
- `KeyframeDesign.jsx` — Photon image generation panel
- Shot assignment (multi-assign per keyframe)
- `keyframesRef` fix for stale closure during async generation
- Proved on LumaSlips: grass sandal + foot gremlin vs T2V hallucination

**Continuous Arc (Phase 1):**
- `getLastFrame()` via photon/v2 with Playwright session
- `submitContinuousShot()` — last_frame[N] as frame0[N+1]
- ◆ ARC toggle in mode bar

**Auteur Brainstorm (Phase 2):**
- `generateAuteurBrainstorm()` — 4 arc-aware variations via Claude
- `evaluateBrainstormOptions()` — selects with directorial rationale
- ✦ button per shot — brainstorm + Auteur picks

**Reasoning Pivot (Phase 3):**
- `detectPivotShot()` — arc position detection
- `buildPivotPrompt()` — enhanced prompt for reasoning model
- `submitWithReasoning()` — Playwright → platform ray-v3-reasoning
- ◆ PIVOT badge on detected shot

### Smoke tests
- Luma Translate 15s — AI Auteur + FULL AUTO chain: 5/5 drafts → 2 finals
- LumaSlips — Photon keyframes: designed grass sandal (woven blades, dew) + gremlin (consistent character)
- Auteur Brainstorm on "Dog's Waiting Eyes" (OPENING): picked "Innocent Expectation" with arc rationale

---

## Sprint 04 — Platform-First Auteur Engine (2026-03-16)

**Status:** Complete (backend + UI wired, ready for E2E testing)

### Reframe

The engine over-indexed on the Luma API (Sprint 02) when the real power is the
Dream Machine *platform*. The public API exposes ~15% of capabilities. The platform
has Keyframe mode, Extend Video, Reframe, Upscale+HDR, Audio, Inpainting, Visual
Annotation, Lipsync, a full conversational AI agent, Brainstorm mode, and more.

Sprint 04 pivots to platform-first with two production modes.

### Built

**PlatformSession (`src/server/platform-session.js`)**
- Reusable browser context manager (one Chromium instance per production run)
- `acquire()` / `release()` lifecycle
- `navigateToBoard()`, `navigateToIdea()`, `navigateToIdeas()`
- `switchMode()` — Describe/Keyframe/Reference/Modify
- `uploadToFrameSlot()` — file upload to start/end frame chiclets
- `setSettings()` — model, draft, aspect, duration
- `interceptGeneration()` — network-level generation ID capture
- `submitPrompt()` — fill + submit with ID capture
- `apiCall()` — authenticated fetch via platform cookies

**New Platform Operations (`src/server/luma-platform.js`)**
- `submitKeyframeGeneration()` — start+end frame upload + prompt + settings
- `extendWithEndFrame()` — Extend Video with guided end frame
- `upscaleGeneration()` — one-click Upscale+HDR
- `addAudioOnPlatform()` — AI audio with text prompt
- `reframeGeneration()` — outpaint to new aspect ratio
- `waitForGeneration()` — poll until complete with timeout
- `downloadLastFrame()` — save last frame for shot chaining

**Auteur State Machine (`src/server/auteur-session.js`)**
- 7-phase production: THINK → DESIGN → GENERATE → CHAIN → POLISH → DELIVER → COMPLETE
- MANUAL mode: stops after DESIGN, exports platform brief
- AUTEUR mode: Playwright drives Dream Machine end-to-end
- Serial generation for visual continuity (shot N's last frame → shot N+1's start)
- Claude Vision evaluation at GENERATE with auto-approve/check-in
- Check-in system with human decision points
- SSE event streaming for real-time UI updates
- Pause / Resume / Abort controls
- Credit tracking

**Server Middleware (`src/server/proxy.js`)**
- `/api/auteur/start` — start session (projectId, runId, mode, settings)
- `/api/auteur/status` — SSE event stream
- `/api/auteur/respond` — human check-in response
- `/api/auteur/pause` / `resume` / `abort`

**UI Components**
- `ProductionView.jsx` — main S04 page at `/projects/:id/produce`
- `ProductionTimeline.jsx` — horizontal shot timeline with state badges + chain connectors
- `ActiveOperationPanel.jsx` — phase-aware panel with check-in dialogue
- `CreditBudget.jsx` — live credit counter
- PRODUCE button added to SchemaOutput mode bar

### Platform Inventory (from live audit)

Full Dream Machine platform capabilities documented:
- 4 creation modes: Describe, Keyframe, Reference, Modify
- 5 post-production tools: Modify, Extend Video, Reframe, Upscale+HDR, Audio
- Shot Palette: 4 categories, 37 tags
- Camera Motion: 11 presets
- Board-level AI: Brainstorm, Show More, Reply, Concept Pills
- Luma Agent: Brainstorm Mode (ideation) + Create Mode (production)
- Inpainting, Visual Annotation, Lipsync, More Like This
- Version chain management, file uploads (PDFs, scripts, media)

### Credit economics

| Tier | 15s Ad (3 shots) | Notes |
|------|-------------------|-------|
| Draft (Ray3.14) | ~624 credits | Iteration tier |
| Full (Ray3 + Char Ref) | ~2,712 credits | Production tier |

### Key decisions

- PlatformSession replaces per-operation browser launches (15→1 launch per run)
- Serial chaining: shot N's last frame → shot N+1's start frame (better continuity)
- AuteurSession is separate from DreamMachineSession (redistribution, not replacement)
- All existing pipeline/auteur/validator code reused unchanged

---

## Environment

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API for pipeline + auteur |
| `LUMA_API_KEY` | Luma Dream Machine API |
| `.playwright-session/` | Playwright browser session for Unlimited plan |
| `data/projects.json` | LowDB storage (gitignored) |

## Ports

| Port | Service |
|------|---------|
| 5173 | Vite dev server (pinned, strictPort) |

## Key files — never modify

| File | Reason |
|------|--------|
| `luma-engine-v2.jsx` | Original working monolith — source of truth |
| `knowledge/` | Creative bible — validates against Luma rules |
| `CLAUDE.md` | Domain context for all AI operations |
