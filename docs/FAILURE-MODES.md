# FAILURE MODES & MITIGATIONS

## API Response Parsing Failures

### Problem: Model prepends preamble text
- **Symptom**: `JSON.parse()` throws on "Here's the JSON:\n{..."
- **Mitigation**: `extractJSON()` Strategy 3 — bracket-match scanner finds first `{` or `[` and scans to matching close
- **File**: `src/lib/api.js`

### Problem: Model wraps in markdown fences
- **Symptom**: Response starts with ` ```json\n `
- **Mitigation**: `extractJSON()` Strategy 2 — strip ` ```json ` and ` ``` ` before parsing
- **File**: `src/lib/api.js`

### Problem: Model returns wrapped object instead of array
- **Symptom**: Shots stage returns `{shots: [...]}` instead of `[...]`
- **Mitigation**: `normalizeShots()` checks `Array.isArray()`, then tries `.shots`, `.data`, and `Object.values().find(Array.isArray)`
- **File**: `src/prompts/shots.js`

### Problem: Model uses different key names
- **Symptom**: `center_of_gravity` instead of `centerOfGravity`, crashes on property access
- **Mitigation**: Every normalizer function (`normalizeScan`, `normalizeArc`, `normalizeShots`) applies defaults for every expected field
- **Files**: `src/prompts/scan.js`, `src/prompts/arc.js`, `src/prompts/shots.js`

### Problem: API returns HTTP error (429, 500, etc.)
- **Symptom**: `resp.json()` throws on error HTML
- **Mitigation**: Check `resp.ok` before parsing. Read error as text. Retry with backoff.
- **File**: `src/lib/api.js`

### Problem: API returns empty content
- **Symptom**: `data.content` is `[]` or text blocks are empty
- **Mitigation**: Explicit check for empty text before `extractJSON()`
- **File**: `src/lib/api.js`

## In-Session vs. Shared Project Divergence

### Root Cause
In-session: the outer Claude's conversation context primes the API routing. Shared projects create FRESH contexts with no priming. The inner Sonnet instances behave differently.

### Affected Behaviors
1. JSON formatting compliance (lower in shared projects)
2. Rate limiting (shared projects may hit different quotas)
3. Response latency (cold starts more common)

### Mitigations Applied
1. `temperature: 0.3` reduces format deviation
2. System prompt hardening appends explicit JSON-only instructions
3. Retry logic with exponential backoff (1s, 2s)
4. 3-strategy JSON extraction handles all observed deviations

## Luma Prompt Generation Failures

### Problem: Prompts exceed 40 words
- **Mitigation**: Client-side validator flags. Auto-fix pass corrects.

### Problem: Dead words in generated prompts
- **Mitigation**: System prompt lists all dead words. Validator catches survivors. Fix pass removes.

### Problem: Negative prompting in generated prompts
- **Mitigation**: System prompt explains positive-only rule with examples. Validator catches with regex. Fix pass rewrites.

### Problem: Transition verbs ("begins to", "starts to")
- **Mitigation**: System prompt provides YES/NO examples. Validator catches with regex. Fix pass substitutes mid-action verbs.

## UI Failures

### Problem: Beat timeline crashes on undefined `.feeling`
- **Mitigation**: Defensive access: `(b.feeling || "—")` everywhere beats are rendered

### Problem: Schema builder crashes on undefined nested properties
- **Mitigation**: All template expressions use optional chaining: `analysis?.scan?.audience || "—"`
