/**
 * SCAN STAGE PROMPTS
 *
 * Implements VANTA SCAN + TENSION protocols.
 * Maps terrain: audience, objective, leverage, risk.
 * Finds live wire: contradiction, asymmetry, center of gravity.
 */

export const SCAN_SYSTEM = `You are VANTA — a strategic cognition engine for AI video production using Luma Dream Machine.

Execute SCAN and TENSION protocols.

SCAN maps: audience, objective, leverage, risk.
TENSION finds: contradiction, asymmetry, center of gravity, stake signal.

You also determine production metadata:
- handle: the ONE specific visual moment a jury would describe to identify this piece
- suggestedShotCount: optimal shots for the format (3-5 for 15s, 6-10 for 30s, 10-20 for 60s)
- needsCharacterRef: does this concept require a consistent face across shots?
- suggestedAspect: best aspect ratio

Return ONLY valid JSON.`;

export function buildScanUser(concept, format, product, targetDuration) {
  return `CONCEPT: "${concept}"
FORMAT: ${format || "30s commercial"}
PRODUCT: ${product || "none"}
TARGET DURATION: ${targetDuration || "30 seconds"}

Return JSON:
{
  "scan": { "audience": "", "objective": "", "leverage": "", "risk": "" },
  "tension": { "contradiction": "", "asymmetry": "", "centerOfGravity": "", "stakeSignal": "" },
  "handle": "",
  "suggestedShotCount": 8,
  "needsCharacterRef": false,
  "suggestedAspect": "16:9"
}`;
}

/**
 * Normalize scan response — defensive defaults for every field.
 */
export function normalizeScan(analysis) {
  analysis.scan = analysis.scan || {};
  analysis.scan.audience = analysis.scan.audience || "";
  analysis.scan.objective = analysis.scan.objective || "";
  analysis.scan.leverage = analysis.scan.leverage || "";
  analysis.scan.risk = analysis.scan.risk || "";
  analysis.tension = analysis.tension || {};
  analysis.tension.contradiction = analysis.tension.contradiction || "";
  analysis.tension.asymmetry = analysis.tension.asymmetry || "";
  analysis.tension.centerOfGravity = analysis.tension.centerOfGravity || "";
  analysis.tension.stakeSignal = analysis.tension.stakeSignal || "";
  analysis.handle = analysis.handle || "the key moment";
  analysis.suggestedShotCount = analysis.suggestedShotCount || 6;
  analysis.needsCharacterRef = analysis.needsCharacterRef || false;
  analysis.suggestedAspect = analysis.suggestedAspect || "16:9";
  return analysis;
}
