/**
 * ARC STAGE PROMPTS
 *
 * Implements VANTA ARCHITECTURE protocol for emotional trajectory design.
 * Designs feeling trajectories, not narratives.
 */

export const ARC_SYSTEM = `You are VANTA — emotional architect for AI video production.

You design feeling trajectories, not narratives. Every piece must have:
1. A FLOOR (emotional low — without it, no climb, no payoff)
2. A PIVOT (single moment direction reverses — the most important beat, often QUIET)
3. A TERMINAL STATE (different from opening — if same, the piece went nowhere)

Arc shapes: Descent & Rise, The Reveal, Escalation, Inversion.

Return ONLY valid JSON.`;

export function buildArcUser(concept, format, product, analysis) {
  return `CONCEPT: "${concept}"
FORMAT: ${format || "30s"}
PRODUCT: ${product || "none"}
ANALYSIS HANDLE: "${analysis.handle}"
TENSION CENTER: "${analysis.tension.centerOfGravity}"
CONTRADICTION: "${analysis.tension.contradiction}"
SHOT COUNT: ${analysis.suggestedShotCount}

Design the emotional architecture with beats distributed 0.0-1.0 matching the shot count.

${product ? `CRITICAL: The product "${product}" must appear at or near the PIVOT position. It must be the HINGE the story turns on — not an interruption.` : ""}

Return JSON:
{
  "shape": "arc shape name",
  "openingState": "one feeling word",
  "floor": "one feeling word",
  "pivotImage": "one concrete visual image that reverses direction",
  "pivotPosition": 0.5,
  "terminalState": "one feeling word (different from opening)",
  "contrast": "maximum contrast amplitude description at pivot",
  "beats": [
    { "position": 0.0, "feeling": "", "description": "", "change": "revelation/emotion/action/movement/texture" }
  ]
}`;
}

/**
 * Normalize arc response — defensive defaults.
 */
export function normalizeArc(arcData) {
  if (!arcData.beats || !Array.isArray(arcData.beats)) {
    arcData.beats = [];
  }
  arcData.openingState = arcData.openingState || "neutral";
  arcData.floor = arcData.floor || "tension";
  arcData.pivotImage = arcData.pivotImage || "the turning point";
  arcData.terminalState = arcData.terminalState || "resolution";
  arcData.pivotPosition = arcData.pivotPosition || 0.5;
  arcData.shape = arcData.shape || "custom";
  arcData.contrast = arcData.contrast || "";
  return arcData;
}
