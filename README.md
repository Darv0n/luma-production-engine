# LUMA PRODUCTION ENGINE

**Drop concept. Engine runs. Schema appears.**

An automated production pipeline that transforms raw creative concepts into
Luma Dream Machine-ready shot schemas using AI-powered creative analysis.

## What It Does

1. You write a concept (raw, unstructured, stream-of-consciousness)
2. The engine runs a 5-stage automated pipeline:
   - **SCAN** — Maps terrain (audience, stakes, leverage, risk)
   - **ARC** — Designs emotional trajectory (floor, pivot, terminal state)
   - **SHOTS** — Generates Luma-validated prompts with full generation settings
   - **VALIDATE** — Pressure-tests every prompt against Luma's rules
   - **SCHEMA** — Assembles copy-paste-ready production document
3. You get per-shot prompts you can paste directly into Luma Dream Machine

## Quick Start

### In Claude.ai (Simplest)
Copy `luma-engine-v2.jsx` into a Claude artifact. It runs immediately.

### In Claude Code
Open this project directory. Read `CLAUDE.md` first — it contains everything
Claude Code needs to understand the architecture, domain rules, and defensive
patterns.

### Standalone
See `docs/DEPLOYMENT.md` for Vite, Next.js, and other deployment options.

## Project Structure

```
CLAUDE.md                  ← Master instruction file for Claude Code
luma-engine-v2.jsx         ← Production-tested monolith (runs in artifacts)
knowledge/
  LUMA-TECHNICAL.md        ← Luma Dream Machine technical reference
  CREATIVE-ENGINE.md       ← Creative execution methodology
  VANTA-STACK.md           ← VANTA cognitive engine specification
src/
  lib/
    api.js                 ← Hardened API client (3-strategy JSON, retries)
    pipeline.js            ← 5-stage pipeline orchestrator
    validator.js           ← Client-side Luma prompt validator
    credits.js             ← Credit cost estimator
    schema-builder.js      ← Plain-text schema document generator
  prompts/
    scan.js                ← SCAN stage prompt templates + normalizer
    arc.js                 ← ARC stage prompt templates + normalizer
    shots.js               ← SHOTS stage prompt templates + normalizer
    fix.js                 ← AUTO-FIX prompt templates + apply logic
  styles/
    theme.js               ← Design tokens, global CSS
docs/
  ARCHITECTURE.md          ← System architecture and data flow
  FAILURE-MODES.md         ← Known failures and mitigations
  DEPLOYMENT.md            ← How to deploy standalone
```

## Key Design Decisions

- **Defense-in-depth for LLM-as-backend**: The inner API calls create fresh model
  instances with no context. They WILL deviate from format. The architecture assumes this.
- **Client-side validation**: Don't trust the inner model to follow Luma rules.
  Validate every prompt. Auto-fix failures.
- **Knowledge separation**: Domain knowledge lives in `knowledge/` files, not scattered
  through code. Prompt templates live in `prompts/`, not inline.
- **Monolith + modules**: The monolith is production-tested in Claude.ai artifacts.
  The modular version is the same logic decomposed for standalone development.

## March 2026

Built for Ray3.14 / Ray3 / Ray3 Modify.
