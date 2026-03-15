# ARCHITECTURE

## Data Flow

```
User Input (concept, format, product, duration)
       │
       ▼
┌─────────────┐
│ SCAN STAGE  │  API Call 1 → VANTA SCAN + TENSION
│             │  → audience, objective, leverage, risk
│             │  → contradiction, asymmetry, center, stakes
│             │  → handle, shot count, character ref, aspect
└──────┬──────┘
       ▼
┌─────────────┐
│ ARC STAGE   │  API Call 2 → Emotional Architecture
│             │  → shape, opening, floor, pivot, terminal
│             │  → beat map with positions + feelings
│             │  → contrast amplitude at pivot
└──────┬──────┘
       ▼
┌─────────────┐
│ SHOTS STAGE │  API Call 3 → Shot Generation
│             │  System prompt embeds ALL Luma rules
│             │  → per-shot: prompt, settings, vision, audio
│             │  → cut types, risks, fallbacks
└──────┬──────┘
       ▼
┌─────────────┐
│ VALIDATE    │  Client-side validation on every prompt
│             │  → word count, dead words, negatives, verbs
│             │  → score 0-100 per prompt
│             │  IF score < 50: API Call 4 (auto-fix)
└──────┬──────┘
       ▼
┌─────────────┐
│ ⧑ SCHEMA    │  Production document assembled
│             │  → copy-paste-ready Luma format
│             │  → per-prompt copy buttons
│             │  → inline edit with live revalidation
└─────────────┘
```

## Module Dependency Graph

```
luma-engine-v2.jsx (monolith — contains all UI components inline)
  │
  │  Decomposed logic equivalents in src/:
  │
  ├── src/lib/pipeline.js (orchestrator)
  │     ├── src/lib/api.js (hardened HTTP + JSON extraction)
  │     ├── src/lib/validator.js (client-side prompt rules)
  │     ├── src/prompts/scan.js (system + user prompts, normalizer)
  │     ├── src/prompts/arc.js (system + user prompts, normalizer)
  │     ├── src/prompts/shots.js (system + user prompts, normalizer)
  │     └── src/prompts/fix.js (system + user prompts, apply logic)
  ├── src/lib/credits.js (cost estimation)
  ├── src/lib/schema-builder.js (plain text output)
  └── src/styles/theme.js (design tokens)

  UI components (currently inline in monolith, extract to src/components/ when building standalone):
  ├── PipelineProgress — stage indicator with animation states
  ├── LiveResults — real-time display of completed stages
  ├── SchemaOutput — shot cards, copy buttons, inline editing
  └── LumaProductionEngine (App) — state management, pipeline orchestration
```

## State Management

Single parent component (App.jsx) holds all state:
- `concept`, `format`, `product`, `targetDuration` — user inputs
- `pipelineStage` — current stage ID (idle/scan/arc/shots/validate/done)
- `stageData` — accumulated results from completed stages
- `finalResult` — complete pipeline output
- `error` — error message if pipeline fails
- `running` — boolean lock

The `onStage` callback from `runPipeline` updates both `pipelineStage`
and `stageData` in real time, enabling the UI to show results as each
stage completes.

## Why the Monolith Exists

`luma-engine-v2.jsx` is the production-tested, working monolith that runs
in Claude.ai artifacts. It contains everything in a single file because
the artifact runtime requires it.

The `src/` directory is the same logic decomposed into modules for
Claude Code / standalone React app development. When modifying, ensure
both stay in sync or fully migrate to the modular version.
