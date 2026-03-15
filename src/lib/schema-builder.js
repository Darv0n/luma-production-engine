/**
 * SCHEMA BUILDER
 *
 * Generates the plain-text production schema document.
 * This is the final deliverable — copy-paste ready for production teams.
 */

import { estimateCredits } from "./credits.js";

/**
 * Build the full production schema as a plain text document.
 */
export function buildFullSchema(
  concept,
  format,
  product,
  targetDuration,
  analysis,
  arcData,
  shots,
  validations
) {
  const pad = (s, n) => (s || "").padEnd(n);
  const credits = estimateCredits(shots);
  const eq = "=".repeat(80);
  const dash = "─".repeat(40);
  const dot = "·".repeat(72);

  let out = `${eq}

  LUMA DREAM MACHINE — PRODUCTION SCHEMA
  Automated Pipeline Output

  Concept:  ${(concept || "").slice(0, 70)}
  Format:   ${format || "—"}  |  Duration: ${targetDuration || "—"}
  Product:  ${product || "none"}
  Handle:   "${analysis?.handle || "—"}"
  Credits:  ~${credits.toLocaleString()} (15% buffer included)

${eq}


TERRAIN ANALYSIS
${dash}
  Audience:     ${analysis?.scan?.audience || "—"}
  Objective:    ${analysis?.scan?.objective || "—"}
  Leverage:     ${analysis?.scan?.leverage || "—"}
  Risk:         ${analysis?.scan?.risk || "—"}

  Contradiction: ${analysis?.tension?.contradiction || "—"}
  Asymmetry:     ${analysis?.tension?.asymmetry || "—"}
  Center:        ${analysis?.tension?.centerOfGravity || "—"}
  Stakes:        ${analysis?.tension?.stakeSignal || "—"}


EMOTIONAL ARC
${dash}
  Shape:    ${arcData?.shape || "—"}
  Opening:  ${arcData?.openingState || "—"}
  Floor:    ${arcData?.floor || "—"}
  Pivot:    ${arcData?.pivotImage || "—"}
  Terminal: ${arcData?.terminalState || "—"}
  Contrast: ${arcData?.contrast || "—"}

  BEATS:
${(arcData?.beats || [])
  .map(
    (b, i) =>
      `    ${String(i + 1).padStart(2)}. [${((b.position || 0) * 100).toFixed(0).padStart(3)}%] ${(b.feeling || "—").toUpperCase().padEnd(16)} ${b.description || ""}`
  )
  .join("\n")}


${eq}
SHOT SCHEMAS
${eq}

`;

  shots.forEach((s, i) => {
    const v = validations?.[i];
    out += `
SHOT ${String(i + 1).padStart(2, "0")}: ${(s.name || "UNTITLED").toUpperCase()}                                     [${s.duration || "5s"}]
${dot}

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
  │ VALIDATION: ${pad(`${v?.score || 0}/100  [${v?.wordCount || 0}w]  ${(v?.issues || []).length === 0 ? "ALL CHECKS PASS" : (v?.issues || []).map((x) => x.msg).join(" | ")}`, 51)}│
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
${eq}
SELF-TEST
${eq}
  □ First shot claims attention in under 2 seconds?
  □ Arc has clear floor, pivot, and terminal state?
  □ Every shot contains CHANGE?
  □ Contrast between every pair of adjacent shots?
  □ HANDLE identified — "${analysis?.handle || "—"}"?
  ${product ? "□ [PRODUCT] appears at the PIVOT?" : ""}
  □ Ending is a complete doctrine?
  □ At least one major moment is IMPLIED, not shown?
  □ Sound map designed separately?
  □ Every shot achievable in one 5-second generation?

PROMPT QUALITY REPORT:
${shots
  .map((s, i) => {
    const v = validations?.[i] || { score: 0, wordCount: 0, issues: [] };
    return `  Shot ${String(i + 1).padStart(2, "0")}: ${v.score}/100  [${v.wordCount}w]  ${v.issues.length === 0 ? "✓" : v.issues.map((x) => x.msg).join(", ")}`;
  })
  .join("\n")}

${eq}
`;

  return out;
}
