# LUMA PRODUCTION ENGINE — CLAUDE.md

## What This Project Is

An automated production pipeline that transforms raw creative concepts into
Luma Dream Machine-ready shot schemas. Single input, fully automated, AI-powered.

The user drops a concept. The engine runs a 5-stage pipeline (SCAN → ARC → SHOTS →
VALIDATE → SCHEMA) using chained Anthropic API calls. Each stage feeds the next.
The output is a copy-paste-ready production document with per-shot Luma prompts,
generation settings, validation scores, and credit estimates.

## Architecture

```
CLAUDE.md                  ← You are here. Master instruction file.
luma-engine-v2.jsx         ← THE WORKING MONOLITH. Production-tested. Runs in artifacts.
                              Contains all components inline. This is the source of truth.

src/                       ← DECOMPOSED LOGIC LAYER (extracted from monolith)
  lib/
    api.js               — Hardened API client (extractJSON, callAPI with retries)
    pipeline.js          — The 5-stage pipeline orchestrator
    validator.js         — Client-side Luma prompt validator
    credits.js           — Credit cost estimator
    schema-builder.js    — Plain-text schema document generator
  prompts/
    scan.js              — System + user prompt templates for SCAN stage
    arc.js               — System + user prompt templates for ARC stage
    shots.js             — System + user prompt templates for SHOT GENERATION stage
    fix.js               — System + user prompt templates for AUTO-FIX pass
  styles/
    theme.js             — Design tokens, component style objects

knowledge/                 ← DOMAIN REFERENCE (read before modifying prompts)
  LUMA-TECHNICAL.md      — Luma Dream Machine technical reference
  CREATIVE-ENGINE.md     — Creative execution methodology
  VANTA-STACK.md         — VANTA cognitive engine / STACK runtime specification

docs/
  ARCHITECTURE.md        — System architecture and data flow
  FAILURE-MODES.md       — Known failure patterns and mitigations
  DEPLOYMENT.md          — How to deploy as standalone React app
```

### Monolith vs. Modular

The monolith (`luma-engine-v2.jsx`) is the production-tested artifact. It works.
The `src/` directory contains the same logic decomposed into importable modules.

**UI components** (PipelineProgress, LiveResults, SchemaOutput, App) are currently
inline in the monolith. When building the standalone React app, extract them into
`src/components/` and import from the existing `src/lib/` and `src/prompts/` modules.

The modular `src/lib/` and `src/prompts/` are complete and import-ready.
The monolith is the reference for how they wire together at the UI level.

## Core Principles

### 1. The Model Thinks Like a Camera

Luma Dream Machine was trained on film and photography. It does NOT compose scenes
from semantic descriptions. It simulates what a physical camera would capture.
Every prompt must answer: where is the camera, what lens, what light, how far away.

### 2. VANTA/STACK Drives the Pipeline

The creative analysis pipeline implements VANTA's STACK protocol:
- **S**CAN: Map terrain (audience, objective, leverage, risk)
- **T**ENSION: Find the live wire (contradiction, asymmetry, center of gravity)
- **A**RCHITECTURE: Convert force into form (emotional arc, beat structure)
- **C**ALIBRATION: Pressure-test (prompt validation, auto-fix pass)
- **K**ILLSHOT: Deliver strongest form (production schema)

### 3. Defense-in-Depth for LLM-as-Backend

The inner API calls create FRESH model instances with NO conversation context.
They WILL deviate from format. The architecture assumes this:

- **JSON Extraction**: 3-strategy parser (direct → strip fences → bracket-match)
- **Retry Logic**: 2 retries with exponential backoff on main calls, 1 on fix pass
- **Defensive Normalization**: Every API response gets default-filled before use
- **System Prompt Hardening**: JSON-only enforcement appended to every call
- **Temperature 0.3**: Reduces format deviation without killing creativity

### 4. Luma Prompt Rules (Non-Negotiable)

These are architectural facts about how the model processes language:

1. **Positive prompting only** — "no X" activates X then fails to negate
2. **Mid-action verbs** — "running" not "begins to run" (transitions = weak motion)
3. **20-40 words** — under 20: model guesses. Over 50: ignores later words
4. **Dead words** — vibrant, whimsical, hyper-realistic, beautiful, amazing, stunning,
   cinematic, 8K, 4K, masterpiece, trending (consume budget, produce nothing)
5. **One subject, one action, one camera move** per clip
6. **Prompt structure order matters**: Shot type → Subject + verb → Secondary motion →
   Camera motion → Lighting → Mood. Equipment prime optional at end.
7. **Shot type is highest-leverage word** — sets framing, distance, composition
8. **Secondary motion separates amateur from professional** — physics cues tell
   the model this is a physical world (wind, reflections, particles, fabric)

### 5. Image-to-Video > Text-to-Video

Keyframe images carry 70% of the shot. The prompt carries action, camera, physics.
Always recommend I2V mode. T2V is fallback only.

## Model Selection Logic

```
Does a specific face need to match across shots?
  YES → Ray3 with Character Reference
  NO  → Ray3.14 (faster, cheaper, better stability)
```

Ray3 Modify is for video-to-video transformation only.

## The Emotional Arc

Every piece must have:
1. **Floor** — lowest emotional point (without it, no climb)
2. **Pivot** — single moment where direction reverses (where meaning is made)
3. **Terminal state** — different from opening (if same, piece went nowhere)

If the concept has a product, the product appears AT the pivot. Not as interruption
but as the hinge the story turns on.

## Credit Economics

```
Draft 5s:     ~40 credits
1080p SDR 5s: ~400 credits
1080p SDR 10s: ~800 credits
Formula: (shots × drafts × draft_cost) + (shots × finals × final_cost) + 15% buffer
```

## Known Failure Modes

### API Response Parsing
- Model prepends "Here's the JSON:" → bracket-match scanner handles
- Model wraps in ```json fences → strip-fences strategy handles
- Model returns {shots:[...]} instead of [...] → array normalization handles
- Model uses different key names → defensive defaults handle

### Luma Generation
- Hands/fingers: extra digits, unnatural positioning → frame tighter, generate 20+ drafts
- Multi-subject: faces merge, bodies clip → reduce to 1-2 subjects per clip
- Morphing: objects change shape → use I2V, shorter clips, start+end keyframes
- Camera motion accuracy: dolly→zoom confusion → add physical specificity
- Text in video: scrambles after 2-3 chars → always add text in post
- Face consistency: drift across shots → Character Reference on Ray3 only

## Style & Aesthetic

The UI is dark, monospace, brutalist-utilitarian. JetBrains Mono primary.
Background #0c0c0c, text #e8e4de, dim text rgba(232,228,222,0.3).
The tool looks like what it is — an engine, not a toy.

## Tech Stack

- React 18+ (functional components, hooks)
- Anthropic API (claude-sonnet-4-20250514)
- No external UI libraries (all custom styled components)
- No build tooling assumptions (works in Vite, CRA, Next.js)

## When Modifying This Project

1. **Read knowledge/ files before changing prompts** — they contain the validated rules
2. **Never remove retry logic or JSON extraction** — these exist because production broke without them
3. **Test with shared/published projects** — in-session works ≠ production works
4. **Validate prompts client-side** — don't trust the inner model to follow Luma rules
5. **Keep prompt templates in prompts/ directory** — separating prompts from logic enables tuning
