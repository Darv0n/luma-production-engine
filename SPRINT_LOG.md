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
