import { useState, useRef, useCallback, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// LUMA DREAM MACHINE — AUTOMATED PRODUCTION ENGINE v2
// Drop concept. Engine runs. Schema appears.
// ═══════════════════════════════════════════════════════════════════════════

const PIPELINE_STAGES = [
  { id: "idle", label: "READY", icon: "○" },
  { id: "scan", label: "SCAN", icon: "◎", desc: "Mapping terrain — audience, stakes, leverage" },
  { id: "arc", label: "ARC", icon: "◠", desc: "Architecting emotional trajectory" },
  { id: "shots", label: "SHOTS", icon: "▦", desc: "Generating shot list with Luma-validated prompts" },
  { id: "validate", label: "VALIDATE", icon: "⬡", desc: "Pressure-testing every prompt against Luma rules" },
  { id: "done", label: "⧑ SCHEMA", icon: "⧑", desc: "Production schema ready" },
];

const DEAD_WORDS = [
  "vibrant", "whimsical", "hyper-realistic", "beautiful", "amazing",
  "stunning", "cinematic", "8k", "4k", "masterpiece", "trending",
  "professional", "high quality", "detailed", "best quality"
];

// ─── Prompt Validator (client-side, runs on every generated prompt) ──────
function validatePrompt(text) {
  if (!text) return { wordCount: 0, issues: [], score: 0 };
  const words = text.trim().split(/\s+/);
  const lower = text.toLowerCase();
  const issues = [];

  if (words.length < 20) issues.push({ sev: "warn", msg: `${words.length}w — under 20. Model fills gaps.` });
  else if (words.length > 50) issues.push({ sev: "error", msg: `${words.length}w — over 50. Later instructions ignored.` });
  else if (words.length > 40) issues.push({ sev: "warn", msg: `${words.length}w — over 40. Approaching ceiling.` });

  DEAD_WORDS.forEach(dw => {
    if (lower.includes(dw)) issues.push({ sev: "error", msg: `Dead word: "${dw}"` });
  });

  [/\bno\s+\w+/i, /\bwithout\s+/i, /\bavoid\s+/i, /\bdon'?t\s+include/i, /\bexclude\s+/i].forEach(p => {
    if (p.test(text)) issues.push({ sev: "error", msg: "Negative prompt. Luma is positive-only." });
  });

  [/\bbegins?\s+to\b/i, /\bstarts?\s+to\b/i, /\babout\s+to\b/i].forEach(p => {
    if (p.test(text)) issues.push({ sev: "error", msg: "Transition verb. Use mid-action." });
  });

  const shotTypes = ["extreme close-up", "close-up", "medium close-up", "medium shot", "medium wide", "wide shot", "extreme wide", "over-the-shoulder", "pov", "low angle", "high angle", "bird's eye", "dutch angle", "two-shot"];
  if (!shotTypes.some(st => lower.includes(st))) {
    issues.push({ sev: "warn", msg: "No shot type detected." });
  }

  const errors = issues.filter(i => i.sev === "error").length;
  const warns = issues.filter(i => i.sev === "warn").length;
  const score = Math.max(0, 100 - (errors * 25) - (warns * 10));

  return { wordCount: words.length, issues, score };
}

// ─── Credit Estimator ────────────────────────────────────────────────────
function estimateCredits(shots) {
  if (!shots?.length) return 0;
  const costs = { "5s": { draft: 40, final: 400 }, "10s": { draft: 80, final: 800 } };
  let total = 0;
  shots.forEach(s => {
    const c = costs[s.duration] || costs["5s"];
    total += (s.draftCount || 15) * c.draft + 2 * c.final;
  });
  return Math.ceil(total * 1.15);
}

// ─── Schema Text Generator ──────────────────────────────────────────────
function buildFullSchema(concept, format, product, targetDuration, analysis, arcData, shots, validations) {
  const pad = (s, n) => (s || "").padEnd(n);
  const credits = estimateCredits(shots);

  let out = `${"=".repeat(80)}

  LUMA DREAM MACHINE — PRODUCTION SCHEMA
  Automated Pipeline Output

  Concept:  ${(concept || "").slice(0, 70)}
  Format:   ${format || "—"}  |  Duration: ${targetDuration || "—"}
  Product:  ${product || "none"}
  Handle:   "${analysis?.handle || "—"}"
  Credits:  ~${credits.toLocaleString()} (15% buffer included)

${"=".repeat(80)}


TERRAIN ANALYSIS
${"─".repeat(40)}
  Audience:     ${analysis?.scan?.audience || "—"}
  Objective:    ${analysis?.scan?.objective || "—"}
  Leverage:     ${analysis?.scan?.leverage || "—"}
  Risk:         ${analysis?.scan?.risk || "—"}

  Contradiction: ${analysis?.tension?.contradiction || "—"}
  Asymmetry:     ${analysis?.tension?.asymmetry || "—"}
  Center:        ${analysis?.tension?.centerOfGravity || "—"}
  Stakes:        ${analysis?.tension?.stakeSignal || "—"}


EMOTIONAL ARC
${"─".repeat(40)}
  Shape:    ${arcData?.shape || "—"}
  Opening:  ${arcData?.openingState || "—"}
  Floor:    ${arcData?.floor || "—"}
  Pivot:    ${arcData?.pivotImage || "—"}
  Terminal: ${arcData?.terminalState || "—"}
  Contrast: ${arcData?.contrast || "—"}

  BEATS:
${(arcData?.beats || []).map((b, i) => `    ${String(i + 1).padStart(2)}. [${((b.position || 0) * 100).toFixed(0).padStart(3)}%] ${(b.feeling || "—").toUpperCase().padEnd(16)} ${b.description || ""}`).join("\n")}


${"=".repeat(80)}
SHOT SCHEMAS
${"=".repeat(80)}

`;

  shots.forEach((s, i) => {
    const v = validations?.[i];
    out += `
SHOT ${String(i + 1).padStart(2, "0")}: ${(s.name || "UNTITLED").toUpperCase()}                                     [${s.duration || "5s"}]
${"·".repeat(72)}

  VISION:
  ${s.vision || "—"}

  AUDIO:
  ${s.audio || "—"}

  ┌─ GENERATION SETTINGS ────────────────────────────────────────────────┐
  │ Model:          ${pad(s.model, 48)}│
  │ Mode:           ${pad(s.mode, 48)}│
  │ Quality:        ${pad(`Draft → ${s.quality} for final`, 48)}│
  │ Aspect Ratio:   ${pad(s.aspect, 48)}│
  │ Duration:       ${pad(s.duration, 48)}│
  │ Start Frame:    ${pad(s.startFrame || "keyframe required", 48)}│
  │ End Frame:      ${pad(s.endFrame || "none", 48)}│
  │ Character Ref:  ${pad(s.characterRef || "none", 48)}│
  │ Loop:           ${pad(s.loop ? "Yes" : "No", 48)}│
  │                                                                      │
  │ PROMPT:                                                              │
  │ "${s.prompt}"
  │                                                                      │
  │ VALIDATION: ${pad(`${v?.score || 0}/100  [${v?.wordCount || 0}w]  ${(v?.issues || []).length === 0 ? "ALL CHECKS PASS" : (v?.issues || []).map(x => x.msg).join(" | ")}`, 51)}│
  │                                                                      │
  │ TARGET: ${pad(`${s.draftCount || 15} drafts`, 55)}│
  │ KNOWN RISK: ${pad(s.knownRisk || "Standard generation risk", 51)}│
  │ FALLBACK:   ${pad(s.fallback || "Iterate with modified prompt", 51)}│
  └──────────────────────────────────────────────────────────────────────┘

  CUT TO NEXT: ${s.cutType || "—"}
  POST: ${s.postNotes || "—"}

`;
  });

  out += `
${"=".repeat(80)}
SELF-TEST
${"=".repeat(80)}
  □ First shot claims attention in under 2 seconds?
  □ Arc has clear floor, pivot, and terminal state?
  □ Every shot contains CHANGE?
  □ Contrast between every pair of adjacent shots?
  □ HANDLE identified — "${analysis?.handle || "—"}"?
  ${product ? `□ [PRODUCT] appears at the PIVOT?` : ""}
  □ Ending is a complete doctrine?
  □ At least one major moment is IMPLIED, not shown?
  □ Sound map designed separately?
  □ Every shot achievable in one 5-second generation?

PROMPT QUALITY REPORT:
${shots.map((s, i) => {
  const v = validations?.[i] || { score: 0, wordCount: 0, issues: [] };
  return `  Shot ${String(i + 1).padStart(2, "0")}: ${v.score}/100  [${v.wordCount}w]  ${v.issues.length === 0 ? "✓" : v.issues.map(x => x.msg).join(", ")}`;
}).join("\n")}

${"=".repeat(80)}
`;
  return out;
}


// ═══════════════════════════════════════════════════════════════════════════
// API CALL RUNNER — HARDENED
// ═══════════════════════════════════════════════════════════════════════════

function extractJSON(raw) {
  // Strategy 1: direct parse
  try { return JSON.parse(raw); } catch (e) { /* continue */ }

  // Strategy 2: strip markdown fences
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch (e) { /* continue */ }

  // Strategy 3: find first { or [ and extract to matching close
  const objStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");
  let start = -1;
  let openChar = "{";
  let closeChar = "}";

  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    start = objStart;
    openChar = "{"; closeChar = "}";
  } else if (arrStart >= 0) {
    start = arrStart;
    openChar = "["; closeChar = "]";
  }

  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === openChar) depth++;
      if (ch === closeChar) depth--;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)); } catch (e) { break; }
      }
    }
  }

  throw new Error("Could not extract valid JSON from API response");
}

async function callAPI(systemPrompt, userPrompt, retries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          temperature: 0.3,
          system: systemPrompt + "\n\nCRITICAL: Your entire response must be valid JSON. No markdown code fences. No explanation text before or after. No ```json wrapper. Start with { or [ and end with } or ]. Nothing else.",
          messages: [{ role: "user", content: userPrompt }]
        })
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "unknown");
        throw new Error("API HTTP " + resp.status + ": " + errText.slice(0, 200));
      }

      const data = await resp.json();

      // Check for API-level errors
      if (data.error) {
        throw new Error("API error: " + (data.error.message || JSON.stringify(data.error)));
      }

      const text = (data.content || []).map(c => c.text || "").join("");

      if (!text.trim()) {
        throw new Error("API returned empty content");
      }

      return extractJSON(text);

    } catch (e) {
      lastError = e;
      console.warn("API attempt " + (attempt + 1) + " failed:", e.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error("Pipeline failed after " + (retries + 1) + " attempts: " + (lastError?.message || "unknown error"));
}


// ═══════════════════════════════════════════════════════════════════════════
// THE PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
async function runPipeline(concept, format, product, targetDuration, onStage) {
  // ─── STAGE 1: SCAN + TENSION ──────────────────────────────────────────
  onStage("scan", null);

  const analysis = await callAPI(
    `You are VANTA — a strategic cognition engine for AI video production using Luma Dream Machine. Execute SCAN and TENSION protocols. Return ONLY valid JSON. No markdown. No backticks. No preamble.`,
    `CONCEPT: "${concept}"
FORMAT: ${format || "30s commercial"}
PRODUCT: ${product || "none"}
TARGET DURATION: ${targetDuration || "30 seconds"}

Execute full SCAN (audience, objective, leverage, risk) and TENSION (contradiction, asymmetry, center of gravity, stake signal) analysis.

Also determine:
- handle: the ONE specific visual moment a jury would describe to identify this piece
- suggestedShotCount: optimal number of shots for this format (3-5 for 15s, 6-10 for 30s, 10-20 for 60s)
- needsCharacterRef: does this concept require a consistent face across shots? (true/false)
- suggestedAspect: best aspect ratio for this concept

Return as JSON:
{
  "scan": { "audience": "", "objective": "", "leverage": "", "risk": "" },
  "tension": { "contradiction": "", "asymmetry": "", "centerOfGravity": "", "stakeSignal": "" },
  "handle": "",
  "suggestedShotCount": 8,
  "needsCharacterRef": false,
  "suggestedAspect": "16:9"
}`
  );

  // Normalize analysis — ensure nested objects exist
  analysis.scan = analysis.scan || {};
  analysis.tension = analysis.tension || {};
  analysis.handle = analysis.handle || "the key moment";
  analysis.suggestedShotCount = analysis.suggestedShotCount || 6;
  analysis.needsCharacterRef = analysis.needsCharacterRef || false;
  analysis.suggestedAspect = analysis.suggestedAspect || "16:9";

  onStage("scan", analysis);

  // ─── STAGE 2: EMOTIONAL ARC ───────────────────────────────────────────
  onStage("arc", null);

  const arcData = await callAPI(
    `You are VANTA — emotional architect for AI video production. You design feeling trajectories, not narratives. Return ONLY valid JSON.`,
    `CONCEPT: "${concept}"
FORMAT: ${format || "30s"}
PRODUCT: ${product || "none"}
ANALYSIS HANDLE: "${analysis.handle}"
TENSION CENTER: "${analysis.tension.centerOfGravity}"
CONTRADICTION: "${analysis.tension.contradiction}"
SHOT COUNT: ${analysis.suggestedShotCount}

Design the emotional architecture. You must include:
1. An OPENING STATE (one feeling word)
2. A FLOOR (the emotional low — without this there is no climb)
3. A PIVOT (one concrete visual IMAGE that reverses direction — the most important beat)
4. A TERMINAL STATE (different from opening — if same, the piece went nowhere)
5. Beats distributed 0.0-1.0 matching the shot count

The shape must serve this concept. Arc shapes: Descent & Rise, The Reveal, Escalation, Inversion.

${product ? `CRITICAL: The product "${product}" must appear at or near the PIVOT position. It must be the HINGE the story turns on — not an interruption.` : ""}

Return JSON:
{
  "shape": "arc shape name",
  "openingState": "",
  "floor": "",
  "pivotImage": "",
  "pivotPosition": 0.5,
  "terminalState": "",
  "contrast": "maximum contrast amplitude description at pivot",
  "beats": [
    { "position": 0.0, "feeling": "", "description": "", "change": "what changes in this beat (revelation/emotion/action/movement/texture)" }
  ]
}`
  );

  // Normalize arcData — ensure beats array exists
  if (!arcData.beats || !Array.isArray(arcData.beats)) {
    arcData.beats = [];
  }
  arcData.openingState = arcData.openingState || "neutral";
  arcData.floor = arcData.floor || "tension";
  arcData.pivotImage = arcData.pivotImage || "the turning point";
  arcData.terminalState = arcData.terminalState || "resolution";
  arcData.pivotPosition = arcData.pivotPosition || 0.5;
  arcData.shape = arcData.shape || "custom";

  onStage("arc", arcData);

  // ─── STAGE 3: SHOT GENERATION ─────────────────────────────────────────
  onStage("shots", null);

  const defaultModel = analysis.needsCharacterRef ? "Ray3" : "Ray3.14";

  const shots = await callAPI(
    `You are a master cinematographer writing shot descriptions for Luma Dream Machine AI video generation.

ABSOLUTE RULES — violating any of these produces unusable output:

1. PROMPT LENGTH: 20-40 words. Under 20 = model guesses. Over 50 = model ignores later words. Sweet spot: 25-35.

2. PROMPT STRUCTURE (this order matters):
   "[Shot type], [subject + mid-action verb], [secondary motion/physics], [camera motion], [lighting], [mood]. [Equipment prime]."

3. MID-ACTION VERBS ONLY:
   YES: "running" "pouring" "lifting" "falling" "typing"
   NO: "begins to run" "starts to pour" "about to lift" "is going to fall"
   The model renders the STATE described. Transitions = weak motion.

4. POSITIVE PROMPTING ONLY:
   NEVER: "no people" "without clutter" "avoid shadows" "don't include"
   ALWAYS: "empty background" "clean surface" "still air" "soft light"

5. DEAD WORDS — NEVER USE:
   vibrant, whimsical, hyper-realistic, beautiful, amazing, stunning, cinematic, 8K, 4K, masterpiece, trending, professional, high quality, detailed, best quality

6. ONE SUBJECT, ONE ACTION, ONE CAMERA MOVE per shot.

7. SECONDARY MOTION is what separates amateur from professional:
   Wind effects, water reflections, dust, shadows moving, fabric rippling, condensation, particles.
   These tell the model: this is a physical world with consequences.

8. SHOT TYPE is the highest-leverage word. Always include it first.

9. CAMERA MOTION — specify 1-2 max. "Static" / "camera holds steady" is powerful when composition is strong.

10. LIGHTING must be specific: "golden hour backlight" not just "good lighting".

Return ONLY valid JSON array.`,
    `CONCEPT: "${concept}"
FORMAT: ${format || "30s"}
PRODUCT: ${product || "none"}
DEFAULT MODEL: ${defaultModel}
SUGGESTED ASPECT: ${analysis.suggestedAspect}
HANDLE: "${analysis.handle}"
ARC SHAPE: ${arcData.shape}
ARC BEATS:
${arcData.beats.map((b, i) => `  ${i + 1}. [${(b.position * 100).toFixed(0)}%] ${b.feeling} — ${b.description} — CHANGE: ${b.change}`).join("\n")}
PIVOT POSITION: ${arcData.pivotPosition}
PIVOT IMAGE: "${arcData.pivotImage}"
CONTRAST AT PIVOT: "${arcData.contrast}"

Generate exactly ${arcData.beats.length} shots mapping 1:1 to the arc beats above.

For each shot, determine:
- The best shot type for the emotional distance (ECU = vulnerability, CU = emotion, MS = neutral, WS = context/isolation, EWS = insignificance)
- Camera motion that serves the intention (toward = intensity, away = release, with = solidarity, still = observation)
- Whether this specific shot needs a face → if yes and concept needs character consistency, use Ray3 + characterRef. Otherwise Ray3.14.
- The CUT TYPE to the next shot (hard cut / match cut / smash cut / cut on action / cut on emotion)

Return JSON array:
[{
  "name": "short shot name",
  "beatIndex": 0,
  "vision": "what the audience sees and feels — creative direction, NOT the prompt",
  "audio": "three layers: ambient bed | specific sounds | emotional layer (score/silence)",
  "prompt": "the 20-40 word Luma prompt following exact structure above",
  "model": "Ray3.14 or Ray3",
  "mode": "Image-to-Video",
  "quality": "1080p SDR",
  "aspect": "${analysis.suggestedAspect}",
  "duration": "5s",
  "draftCount": 15,
  "loop": false,
  "characterRef": "none or @character",
  "startFrame": "keyframe required",
  "endFrame": "none",
  "knownRisk": "specific failure mode for this shot type",
  "fallback": "specific mitigation strategy",
  "cutType": "cut type to NEXT shot with rationale",
  "postNotes": "color grade, compositing, text overlay notes",
  "change": "what CHANGES in this shot (the hierarchy: revelation > emotion > action > movement > texture)"
}]`
  );

  // Normalize shots — API might return {shots:[...]} instead of [...]
  let shotsArray = Array.isArray(shots) ? shots : (shots?.shots || shots?.data || Object.values(shots).find(v => Array.isArray(v)) || []);

  // Ensure every shot has required fields with defaults
  shotsArray = shotsArray.map((s, i) => ({
    name: s.name || "Shot " + (i + 1),
    beatIndex: s.beatIndex ?? i,
    vision: s.vision || "",
    audio: s.audio || "",
    prompt: s.prompt || "",
    model: s.model || defaultModel,
    mode: s.mode || "Image-to-Video",
    quality: s.quality || "1080p SDR",
    aspect: s.aspect || analysis.suggestedAspect || "16:9",
    duration: s.duration || "5s",
    draftCount: s.draftCount || 15,
    loop: s.loop || false,
    characterRef: s.characterRef || "none",
    startFrame: s.startFrame || "keyframe required",
    endFrame: s.endFrame || "none",
    knownRisk: s.knownRisk || "",
    fallback: s.fallback || "Iterate with modified prompt",
    cutType: s.cutType || "",
    postNotes: s.postNotes || "",
    change: s.change || ""
  }));

  // ─── STAGE 4: VALIDATE ────────────────────────────────────────────────
  onStage("validate", null);

  const validations = shotsArray.map((s, i) => {
    const v = validatePrompt(s.prompt);
    return { ...v, shotIndex: i, name: s.name };
  });

  // Check if any shots need regeneration
  const failing = validations.filter(v => v.score < 50);
  let finalShots = shotsArray;

  if (failing.length > 0) {
    try {
      const fixes = await callAPI(
        `You fix Luma Dream Machine prompts that violate production rules. Same rules: 20-40 words, mid-action verbs, positive only, no dead words. Structure: "[Shot type], [subject + mid-action verb], [secondary motion], [camera motion], [lighting], [mood]. [Equipment prime]."`,
        `Fix these failing prompts while preserving creative intent.

${failing.map(f => `Shot ${f.shotIndex + 1} "${shotsArray[f.shotIndex].name}":
  Current: "${shotsArray[f.shotIndex].prompt}"
  Issues: ${f.issues.map(x => x.msg).join("; ")}`).join("\n\n")}

Return JSON array:
[{ "shotIndex": ${failing[0].shotIndex}, "fixedPrompt": "the corrected prompt" }]`,
        1 // only 1 retry for fix pass
      );

      const fixArray = Array.isArray(fixes) ? fixes : (fixes?.fixes || []);
      finalShots = shotsArray.map((s, i) => {
        const fix = fixArray.find(f => f.shotIndex === i);
        return fix ? { ...s, prompt: fix.fixedPrompt } : s;
      });
    } catch (e) {
      console.warn("Fix pass failed, using originals:", e.message);
    }
  }

  const finalValidations = finalShots.map(s => validatePrompt(s.prompt));

  onStage("validate", { shots: finalShots, validations: finalValidations, fixed: failing.length });

  // ─── STAGE 5: DONE ────────────────────────────────────────────────────
  onStage("done", { analysis, arcData, shots: finalShots, validations: finalValidations });

  return { analysis, arcData, shots: finalShots, validations: finalValidations };
}


// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
  label: {
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    fontSize: "9px", letterSpacing: "2.5px", color: "rgba(232,228,222,0.3)",
    marginBottom: "6px", textTransform: "uppercase"
  },
  input: {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(232,228,222,0.08)",
    borderRadius: "3px", padding: "10px 12px",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: "12px",
    color: "#e8e4de", outline: "none"
  },
  card: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(232,228,222,0.06)",
    borderRadius: "4px", padding: "16px 20px"
  },
  cardHead: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "9px", letterSpacing: "3px", color: "rgba(232,228,222,0.35)",
    marginBottom: "12px"
  },
  btnPrimary: {
    padding: "14px 24px", border: "1px solid rgba(232,228,222,0.2)",
    borderRadius: "3px", background: "rgba(232,228,222,0.06)",
    color: "#e8e4de", fontFamily: "'JetBrains Mono', monospace",
    fontSize: "11px", letterSpacing: "2px", cursor: "pointer",
    width: "100%", transition: "all 0.2s"
  },
  btnSec: {
    padding: "8px 16px", border: "1px solid rgba(232,228,222,0.1)",
    borderRadius: "3px", background: "transparent",
    color: "rgba(232,228,222,0.5)", fontFamily: "'JetBrains Mono', monospace",
    fontSize: "10px", letterSpacing: "1.5px", cursor: "pointer"
  },
  mono: { fontFamily: "'JetBrains Mono', 'SF Mono', monospace" },
  dim: { color: "rgba(232,228,222,0.3)" },
  mid: { color: "rgba(232,228,222,0.5)" },
  bright: { color: "#e8e4de" },
};


// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE PROGRESS INDICATOR
// ═══════════════════════════════════════════════════════════════════════════
function PipelineProgress({ currentStage, stageData }) {
  const stages = PIPELINE_STAGES.filter(s => s.id !== "idle");
  const currentIdx = stages.findIndex(s => s.id === currentStage);

  return (
    <div style={{ margin: "24px 0 32px" }}>
      <div style={{ display: "flex", gap: "2px" }}>
        {stages.map((s, i) => {
          const isActive = s.id === currentStage;
          const isDone = i < currentIdx || currentStage === "done";
          const isProcessing = isActive && !stageData[s.id];
          return (
            <div key={s.id} style={{
              flex: 1, padding: "12px 8px", textAlign: "center",
              background: isActive ? "rgba(232,228,222,0.04)" : "transparent",
              borderBottom: isDone ? "2px solid rgba(232,228,222,0.3)" : isActive ? "2px solid rgba(232,228,222,0.15)" : "2px solid rgba(232,228,222,0.03)",
              transition: "all 0.4s ease"
            }}>
              <div style={{
                fontSize: "14px", marginBottom: "4px",
                color: isDone ? "rgba(232,228,222,0.6)" : isActive ? "#e8e4de" : "rgba(232,228,222,0.15)",
                animation: isProcessing ? "pulse 1.5s infinite" : "none"
              }}>
                {isDone ? "✓" : s.icon}
              </div>
              <div style={{
                ...S.mono, fontSize: "8px", letterSpacing: "2px",
                color: isDone ? "rgba(232,228,222,0.4)" : isActive ? "rgba(232,228,222,0.7)" : "rgba(232,228,222,0.12)"
              }}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
      {currentStage !== "idle" && currentStage !== "done" && (
        <div style={{
          ...S.mono, fontSize: "10px", color: "rgba(232,228,222,0.3)",
          textAlign: "center", marginTop: "12px", letterSpacing: "1px",
          animation: "pulse 1.5s infinite"
        }}>
          {stages.find(s => s.id === currentStage)?.desc || ""}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// LIVE RESULTS PANEL (shows data as each stage completes)
// ═══════════════════════════════════════════════════════════════════════════
function LiveResults({ stageData }) {
  const { scan, arc, validate } = stageData;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {scan && (
        <div style={{ ...S.card, animation: "fadeIn 0.4s ease" }}>
          <div style={S.cardHead}>SCAN + TENSION</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              {Object.entries(scan.scan || {}).map(([k, v]) => (
                <div key={k} style={{ marginBottom: "8px" }}>
                  <div style={{ ...S.label, fontSize: "8px", marginBottom: "2px" }}>{k.toUpperCase()}</div>
                  <div style={{ fontSize: "11px", ...S.mid, lineHeight: "1.5" }}>{v}</div>
                </div>
              ))}
            </div>
            <div>
              {Object.entries(scan.tension || {}).map(([k, v]) => (
                <div key={k} style={{ marginBottom: "8px" }}>
                  <div style={{ ...S.label, fontSize: "8px", marginBottom: "2px" }}>{k.replace(/([A-Z])/g, " $1").toUpperCase()}</div>
                  <div style={{ fontSize: "11px", ...S.mid, lineHeight: "1.5" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: "3px", borderLeft: "2px solid rgba(232,228,222,0.2)" }}>
            <div style={{ ...S.label, fontSize: "8px", marginBottom: "4px" }}>HANDLE</div>
            <div style={{ fontSize: "13px", ...S.bright, lineHeight: "1.6", fontStyle: "italic" }}>"{scan.handle}"</div>
          </div>
        </div>
      )}

      {arc && (
        <div style={{ ...S.card, animation: "fadeIn 0.4s ease" }}>
          <div style={S.cardHead}>EMOTIONAL ARC — {(arc.shape || "").toUpperCase()}</div>
          <div style={{ display: "flex", gap: "24px", marginBottom: "16px", flexWrap: "wrap" }}>
            {[
              ["OPENING", arc.openingState],
              ["FLOOR", arc.floor],
              ["PIVOT", arc.pivotImage],
              ["TERMINAL", arc.terminalState]
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ ...S.label, fontSize: "8px", marginBottom: "2px" }}>{label}</div>
                <div style={{ fontSize: "12px", color: label === "PIVOT" ? "#e8e4de" : "rgba(232,228,222,0.5)", fontWeight: label === "PIVOT" ? 600 : 400 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Beat timeline */}
          <div style={{ position: "relative", padding: "8px 0 0", marginBottom: "8px" }}>
            <div style={{ height: "1px", background: "rgba(232,228,222,0.08)", position: "absolute", top: "14px", left: 0, right: 0 }} />
            <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
              {(arc.beats || []).map((b, i) => {
                const isPivot = Math.abs(b.position - arc.pivotPosition) < 0.05;
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                    <div style={{
                      width: isPivot ? "10px" : "6px", height: isPivot ? "10px" : "6px",
                      borderRadius: "50%", background: isPivot ? "#e8e4de" : "rgba(232,228,222,0.2)",
                      border: isPivot ? "2px solid rgba(232,228,222,0.4)" : "none",
                      marginBottom: "6px", position: "relative", zIndex: 1
                    }} />
                    <div style={{
                      ...S.mono, fontSize: "8px", letterSpacing: "1px",
                      color: isPivot ? "#e8e4de" : "rgba(232,228,222,0.3)",
                      textTransform: "uppercase", textAlign: "center", lineHeight: "1.3"
                    }}>
                      {b.feeling}
                      {isPivot && <div style={{ fontSize: "7px", marginTop: "2px", letterSpacing: "2px" }}>◆ PIVOT</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {validate && (
        <div style={{ ...S.card, animation: "fadeIn 0.4s ease" }}>
          <div style={S.cardHead}>VALIDATION REPORT</div>
          <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ ...S.label, fontSize: "8px" }}>SHOTS</div>
              <div style={{ fontSize: "18px", ...S.bright }}>{validate.shots?.length || 0}</div>
            </div>
            <div>
              <div style={{ ...S.label, fontSize: "8px" }}>AVG SCORE</div>
              <div style={{
                fontSize: "18px",
                color: (validate.validations || []).reduce((a, v) => a + v.score, 0) / Math.max(1, (validate.validations || []).length) >= 75 ? "#5a9a6a" : "#b89c4a"
              }}>
                {Math.round((validate.validations || []).reduce((a, v) => a + v.score, 0) / Math.max(1, (validate.validations || []).length))}
              </div>
            </div>
            <div>
              <div style={{ ...S.label, fontSize: "8px" }}>CREDITS EST.</div>
              <div style={{ fontSize: "18px", ...S.bright }}>{estimateCredits(validate.shots).toLocaleString()}</div>
            </div>
            {validate.fixed > 0 && (
              <div>
                <div style={{ ...S.label, fontSize: "8px" }}>AUTO-FIXED</div>
                <div style={{ fontSize: "18px", color: "#b89c4a" }}>{validate.fixed}</div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {(validate.shots || []).map((s, i) => {
              const v = validate.validations?.[i] || { score: 0, wordCount: 0, issues: [] };
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "6px 10px", background: "rgba(0,0,0,0.15)", borderRadius: "2px",
                  borderLeft: `2px solid ${v.score >= 75 ? "rgba(90,154,106,0.4)" : v.score >= 50 ? "rgba(184,156,74,0.4)" : "rgba(192,86,74,0.4)"}`
                }}>
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim, width: "20px" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ ...S.mono, fontSize: "10px", ...S.mid, flex: "0 0 120px" }}>{s.name}</span>
                  <span style={{
                    ...S.mono, fontSize: "9px", width: "32px",
                    color: v.score >= 75 ? "#5a9a6a" : v.score >= 50 ? "#b89c4a" : "#c0564a"
                  }}>{v.score}</span>
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim, width: "28px" }}>{v.wordCount}w</span>
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.issues.length === 0 ? "✓ all checks pass" : v.issues.map(x => x.msg).join(" · ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA OUTPUT + SHOT EDITOR
// ═══════════════════════════════════════════════════════════════════════════
function SchemaOutput({ result, onUpdateShot }) {
  const [copied, setCopied] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(-1);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editPrompt, setEditPrompt] = useState("");

  const { analysis, arcData, shots, validations } = result;
  const schema = buildFullSchema("", "", "", "", analysis, arcData, shots, validations);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(schema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPrompt = (i) => {
    navigator.clipboard.writeText(shots[i]?.prompt || "");
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx(-1), 1500);
  };

  const startEdit = (i) => {
    setEditingIdx(i);
    setEditPrompt(shots[i]?.prompt || "");
  };

  const saveEdit = (i) => {
    if (onUpdateShot) onUpdateShot(i, { ...shots[i], prompt: editPrompt });
    setEditingIdx(-1);
  };

  const editValidation = editingIdx >= 0 ? validatePrompt(editPrompt) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ ...S.mono, fontSize: "10px", ...S.dim, letterSpacing: "1px" }}>
          {shots.length} SHOTS · {estimateCredits(shots).toLocaleString()} CREDITS
        </div>
        <button onClick={handleCopyAll} style={S.btnPrimary}>
          {copied ? "✓ COPIED FULL SCHEMA" : "⧉ COPY PRODUCTION SCHEMA"}
        </button>
      </div>

      {/* Per-shot cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {shots.map((s, i) => {
          const v = validations?.[i] || { score: 0, wordCount: 0, issues: [] };
          const isEditing = editingIdx === i;
          return (
            <div key={i} style={{
              ...S.card, padding: "12px 16px",
              borderLeft: `2px solid ${v.score >= 75 ? "rgba(90,154,106,0.3)" : v.score >= 50 ? "rgba(184,156,74,0.3)" : "rgba(192,86,74,0.3)"}`
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span style={{ ...S.mono, fontSize: "10px", ...S.dim }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ ...S.mono, fontSize: "12px", ...S.bright }}>{s.name}</span>
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim }}>{s.model} · {s.mode} · {s.aspect} · {s.duration}</span>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{
                    ...S.mono, fontSize: "9px",
                    color: v.score >= 75 ? "#5a9a6a" : v.score >= 50 ? "#b89c4a" : "#c0564a"
                  }}>{v.score}/100 [{v.wordCount}w]</span>
                  <button onClick={() => isEditing ? saveEdit(i) : startEdit(i)} style={{ ...S.btnSec, padding: "4px 10px", fontSize: "8px" }}>
                    {isEditing ? "SAVE" : "EDIT"}
                  </button>
                  <button onClick={() => handleCopyPrompt(i)} style={{ ...S.btnSec, padding: "4px 10px", fontSize: "8px" }}>
                    {copiedIdx === i ? "✓" : "COPY"}
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div>
                  <textarea
                    value={editPrompt}
                    onChange={e => setEditPrompt(e.target.value)}
                    style={{ ...S.input, minHeight: "60px", fontSize: "11px", lineHeight: "1.6" }}
                  />
                  {editValidation && editValidation.issues.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                      {editValidation.issues.map((iss, j) => (
                        <span key={j} style={{
                          ...S.mono, fontSize: "9px", padding: "2px 8px", borderRadius: "2px",
                          background: iss.sev === "error" ? "rgba(192,86,74,0.1)" : "rgba(184,156,74,0.1)",
                          color: iss.sev === "error" ? "#c0564a" : "#b89c4a"
                        }}>{iss.msg}</span>
                      ))}
                    </div>
                  )}
                  {editValidation && (
                    <div style={{ ...S.mono, fontSize: "9px", marginTop: "4px", color: editValidation.score >= 75 ? "#5a9a6a" : "#b89c4a" }}>
                      {editValidation.wordCount}w · {editValidation.score}/100
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  ...S.mono, fontSize: "11px", color: "rgba(232,228,222,0.6)",
                  lineHeight: "1.6", padding: "6px 10px",
                  background: "rgba(0,0,0,0.2)", borderRadius: "3px"
                }}>
                  {s.prompt}
                </div>
              )}

              {/* Vision + Audio + Cut collapsed */}
              <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>VISION </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.vision}</span>
                </div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>AUDIO </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.audio}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "4px", flexWrap: "wrap" }}>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>CUT → </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.cutType}</span>
                </div>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>RISK </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.knownRisk}</span>
                </div>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>CHANGE </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.change}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Raw schema expandable */}
      <details style={{ ...S.card }}>
        <summary style={{ ...S.mono, fontSize: "10px", ...S.dim, letterSpacing: "2px", cursor: "pointer", userSelect: "none" }}>
          RAW SCHEMA TEXT
        </summary>
        <pre style={{
          marginTop: "12px", padding: "16px", background: "rgba(0,0,0,0.3)", borderRadius: "3px",
          ...S.mono, fontSize: "10px", color: "rgba(232,228,222,0.5)", lineHeight: "1.5",
          overflow: "auto", maxHeight: "500px", whiteSpace: "pre-wrap", wordBreak: "break-word"
        }}>
          {schema}
        </pre>
      </details>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function LumaProductionEngine() {
  const [concept, setConcept] = useState("");
  const [format, setFormat] = useState("30s");
  const [product, setProduct] = useState("");
  const [targetDuration, setTargetDuration] = useState("30 seconds");
  const [pipelineStage, setPipelineStage] = useState("idle");
  const [stageData, setStageData] = useState({});
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (!concept.trim() || running) return;
    setRunning(true);
    setError(null);
    setFinalResult(null);
    setStageData({});
    setPipelineStage("scan");

    try {
      const result = await runPipeline(concept, format, product, targetDuration, (stage, data) => {
        setPipelineStage(stage);
        if (data) setStageData(prev => ({ ...prev, [stage]: data }));
      });
      setFinalResult(result);
    } catch (e) {
      console.error("Pipeline error:", e);
      setError(e.message || "Pipeline failed. Check console.");
    }
    setRunning(false);
  };

  const handleUpdateShot = (idx, updatedShot) => {
    if (!finalResult) return;
    const newShots = finalResult.shots.map((s, i) => i === idx ? updatedShot : s);
    const newValidations = newShots.map(s => validatePrompt(s.prompt));
    setFinalResult({ ...finalResult, shots: newShots, validations: newValidations });
  };

  const handleReset = () => {
    setConcept("");
    setProduct("");
    setPipelineStage("idle");
    setStageData({});
    setFinalResult(null);
    setError(null);
    setRunning(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c0c", color: "#e8e4de", ...S.mono }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(232,228,222,0.15); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(232,228,222,0.08); border-radius: 3px; }
        input:focus, textarea:focus, select:focus { border-color: rgba(232,228,222,0.2) !important; outline: none; }
        button:hover:not(:disabled) { opacity: 0.85; }
        button:disabled { opacity: 0.25; cursor: not-allowed; }
        select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6' fill='%23444'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px !important; }
        textarea { resize: vertical; }
        details summary::-webkit-details-marker { display: none; }
        details summary::marker { display: none; content: ""; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "6px", ...S.dim, marginBottom: "4px" }}>LUMA DREAM MACHINE</div>
              <div style={{ fontSize: "18px", letterSpacing: "5px", color: "rgba(232,228,222,0.7)", fontWeight: 300 }}>
                PRODUCTION ENGINE
              </div>
            </div>
            {finalResult && (
              <button onClick={handleReset} style={{ ...S.btnSec, fontSize: "9px" }}>
                ↺ NEW CONCEPT
              </button>
            )}
          </div>
          <div style={{ fontSize: "9px", ...S.dim, letterSpacing: "1.5px", marginTop: "8px" }}>
            DROP CONCEPT → SCAN → TENSION → ARC → SHOTS → VALIDATE → ⧑
          </div>
        </div>

        {/* Input (visible when idle or running scan) */}
        {!finalResult && (
          <div style={{ ...S.card, marginBottom: "24px", animation: "fadeIn 0.3s ease" }}>
            <textarea
              value={concept}
              onChange={e => setConcept(e.target.value)}
              disabled={running}
              placeholder="Drop your concept here. Raw, unstructured, stream-of-consciousness — the engine refines.&#10;&#10;What is this piece? What should the audience feel? Who is it for? What's the one image that makes it unforgettable?"
              style={{
                ...S.input, minHeight: "120px", border: "none", background: "transparent",
                fontSize: "13px", lineHeight: "1.7", padding: "0", marginBottom: "16px",
                color: "#e8e4de"
              }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <div style={S.label}>FORMAT</div>
                <select value={format} onChange={e => setFormat(e.target.value)} disabled={running} style={S.input}>
                  <option value="15s">15s spot</option>
                  <option value="30s">30s spot</option>
                  <option value="60s">60s spot</option>
                  <option value="social">Social (9:16)</option>
                  <option value="cinematic">Cinematic short</option>
                  <option value="product">Product showcase</option>
                </select>
              </div>
              <div>
                <div style={S.label}>TARGET DURATION</div>
                <input value={targetDuration} onChange={e => setTargetDuration(e.target.value)} disabled={running}
                  placeholder="e.g. 30 seconds" style={S.input} />
              </div>
              <div>
                <div style={S.label}>PRODUCT (if commercial)</div>
                <input value={product} onChange={e => setProduct(e.target.value)} disabled={running}
                  placeholder="What's being advertised?" style={S.input} />
              </div>
            </div>

            <button onClick={handleRun} disabled={!concept.trim() || running} style={{
              ...S.btnPrimary, fontSize: "12px", letterSpacing: "3px", padding: "16px",
              background: running ? "transparent" : "rgba(232,228,222,0.06)",
              borderColor: running ? "rgba(232,228,222,0.1)" : "rgba(232,228,222,0.2)"
            }}>
              {running ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", border: "1.5px solid rgba(232,228,222,0.3)", borderTopColor: "#e8e4de", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  PIPELINE RUNNING
                </span>
              ) : (
                "⧑ RUN PRODUCTION PIPELINE"
              )}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "12px 16px", background: "rgba(192,86,74,0.08)", border: "1px solid rgba(192,86,74,0.2)",
            borderRadius: "3px", marginBottom: "16px",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px"
          }}>
            <div style={{ ...S.mono, fontSize: "11px", color: "#c0564a", lineHeight: "1.5", flex: 1 }}>
              ✗ {error}
            </div>
            <button onClick={handleRun} style={{ ...S.btnSec, borderColor: "rgba(192,86,74,0.3)", color: "#c0564a", whiteSpace: "nowrap", fontSize: "9px" }}>
              ↻ RETRY
            </button>
          </div>
        )}

        {/* Pipeline Progress */}
        {pipelineStage !== "idle" && !finalResult && (
          <PipelineProgress currentStage={pipelineStage} stageData={stageData} />
        )}

        {/* Live Results (during pipeline) */}
        {!finalResult && Object.keys(stageData).length > 0 && (
          <LiveResults stageData={stageData} />
        )}

        {/* Final Schema Output */}
        {finalResult && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <div style={{
              textAlign: "center", padding: "20px 0 28px",
              borderBottom: "1px solid rgba(232,228,222,0.06)", marginBottom: "24px"
            }}>
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>⧑</div>
              <div style={{ ...S.mono, fontSize: "10px", letterSpacing: "4px", ...S.dim }}>PRODUCTION SCHEMA READY</div>
              <div style={{ ...S.mono, fontSize: "11px", ...S.mid, marginTop: "8px" }}>
                {finalResult.shots?.length} shots · {estimateCredits(finalResult.shots).toLocaleString()} credits est.
              </div>
            </div>

            {/* Analysis summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div style={S.card}>
                <div style={S.cardHead}>HANDLE</div>
                <div style={{ fontSize: "13px", ...S.bright, fontStyle: "italic", lineHeight: "1.6" }}>
                  "{finalResult.analysis?.handle}"
                </div>
              </div>
              <div style={S.card}>
                <div style={S.cardHead}>ARC: {(finalResult.arcData?.shape || "").toUpperCase()}</div>
                <div style={{ fontSize: "11px", ...S.mid, lineHeight: "1.6" }}>
                  {finalResult.arcData?.openingState} → {finalResult.arcData?.floor} → <strong style={{ color: "#e8e4de" }}>{finalResult.arcData?.pivotImage}</strong> → {finalResult.arcData?.terminalState}
                </div>
              </div>
            </div>

            <SchemaOutput result={finalResult} onUpdateShot={handleUpdateShot} />
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: "48px", paddingTop: "16px",
          borderTop: "1px solid rgba(232,228,222,0.03)",
          fontSize: "8px", ...S.dim, letterSpacing: "1.5px",
          display: "flex", justifyContent: "space-between"
        }}>
          <span>RAY3.14 / RAY3 / RAY3 MODIFY · MARCH 2026</span>
          <span>DROP CONCEPT. ENGINE RUNS. SCHEMA APPEARS.</span>
        </div>
      </div>
    </div>
  );
}
