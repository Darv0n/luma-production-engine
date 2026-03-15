/**
 * PIPELINE ORCHESTRATOR
 *
 * Runs the full 5-stage automated pipeline:
 * SCAN → ARC → SHOTS → VALIDATE → SCHEMA
 *
 * Each stage feeds the next. The onStage callback provides
 * real-time progress updates to the UI.
 */

import { callAPI } from "./api.js";
import { validatePrompt } from "./validator.js";
import { SCAN_SYSTEM, buildScanUser, normalizeScan } from "../prompts/scan.js";
import { ARC_SYSTEM, buildArcUser, normalizeArc } from "../prompts/arc.js";
import {
  SHOTS_SYSTEM,
  buildShotsUser,
  normalizeShots,
} from "../prompts/shots.js";
import { FIX_SYSTEM, buildFixUser, applyFixes } from "../prompts/fix.js";

/**
 * Run the full production pipeline.
 *
 * @param {string} concept - Raw creative concept
 * @param {string} format - Format (15s, 30s, 60s, social, cinematic, product)
 * @param {string} product - Product being advertised (or empty)
 * @param {string} targetDuration - Target duration string
 * @param {Function} onStage - Callback: (stageName, data|null) => void | Promise<void>
 *   Called with null when a stage starts, with data when it completes.
 *   If it returns a Promise, the pipeline awaits it — enabling hard stop gates.
 * @param {Object} [options]
 * @param {Array} [options.characters] - Pre-registered characters for this project
 * @returns {Promise<{analysis, arcData, shots, validations}>}
 */
export async function runPipeline(
  concept,
  format,
  product,
  targetDuration,
  onStage,
  { characters = [] } = {}
) {
  // ─── STAGE 1: SCAN + TENSION ──────────────────────────────────────
  await onStage("scan", null);
  let analysis = await callAPI(
    SCAN_SYSTEM,
    buildScanUser(concept, format, product, targetDuration)
  );
  analysis = normalizeScan(analysis);
  await onStage("scan", analysis);

  // ─── STAGE 2: EMOTIONAL ARC ───────────────────────────────────────
  await onStage("arc", null);
  let arcData = await callAPI(
    ARC_SYSTEM,
    buildArcUser(concept, format, product, analysis)
  );
  arcData = normalizeArc(arcData);
  // Hard stop gate point — onStage may return a Promise that resolves on approval
  await onStage("arc:complete", arcData);
  await onStage("arc", arcData);

  // ─── STAGE 3: SHOT GENERATION ─────────────────────────────────────
  await onStage("shots", null);
  const defaultModel = analysis.needsCharacterRef ? "Ray3" : "Ray3.14";
  const rawShots = await callAPI(
    SHOTS_SYSTEM,
    buildShotsUser(concept, format, product, analysis, arcData, characters)
  );
  let shotsArray = normalizeShots(
    rawShots,
    defaultModel,
    analysis.suggestedAspect
  );

  // ─── STAGE 4: VALIDATE + AUTO-FIX ────────────────────────────────
  onStage("validate", null);

  const validations = shotsArray.map((s, i) => ({
    ...validatePrompt(s.prompt),
    shotIndex: i,
    name: s.name,
  }));

  const failing = validations.filter((v) => v.score < 50);
  let finalShots = shotsArray;

  if (failing.length > 0) {
    try {
      const fixes = await callAPI(
        FIX_SYSTEM,
        buildFixUser(failing, shotsArray),
        1 // only 1 retry for fix pass
      );
      finalShots = applyFixes(shotsArray, fixes);
    } catch (e) {
      console.warn("Fix pass failed, using originals:", e.message);
    }
  }

  const finalValidations = finalShots.map((s) => validatePrompt(s.prompt));

  onStage("validate", {
    shots: finalShots,
    validations: finalValidations,
    fixed: failing.length,
  });

  // ─── STAGE 5: DONE ───────────────────────────────────────────────
  const result = {
    analysis,
    arcData,
    shots: finalShots,
    validations: finalValidations,
  };
  onStage("done", result);

  return result;
}

/**
 * Build a targeted prompt for regenerating exactly one shot.
 * Internal — used by rerunShot.
 */
function buildSingleShotUser(beatIndex, concept, format, product, analysis, arcData) {
  const defaultModel = analysis.needsCharacterRef ? "Ray3" : "Ray3.14";
  const beat = (arcData.beats || [])[beatIndex] || {};
  const totalBeats = arcData.beats?.length || 6;
  const pivotIdx = (arcData.beats || []).findIndex(
    (b) => Math.abs((b.position || 0) - (arcData.pivotPosition || 0.5)) < 0.05
  );
  const isPivot = beatIndex === pivotIdx;

  return `CONCEPT: "${concept}"
FORMAT: ${format || "30s"}
PRODUCT: ${product || "none"}
DEFAULT MODEL: ${defaultModel}
SUGGESTED ASPECT: ${analysis.suggestedAspect}
HANDLE: "${analysis.handle}"
ARC SHAPE: ${arcData.shape}
PIVOT IMAGE: "${arcData.pivotImage}"
CONTRAST: "${arcData.contrast}"

FULL ARC CONTEXT (for reference — do not generate these shots):
${(arcData.beats || []).map((b, i) => `  ${i + 1}. [${((b.position || 0) * 100).toFixed(0)}%] ${b.feeling || "—"} — ${b.description || "—"}`).join("\n")}

TARGET: Regenerate ONLY shot ${beatIndex + 1} of ${totalBeats}:
  Beat: [${((beat.position || 0) * 100).toFixed(0)}%] ${beat.feeling || "—"}
  Description: ${beat.description || "—"}
  Change: ${beat.change || "—"}
${isPivot ? "\nTHIS IS THE PIVOT SHOT. The product (if any) appears here. Maximum contrast. This is where meaning is made.\n" : ""}
Return JSON array with exactly 1 shot object:
[{ "name": "short shot name", "beatIndex": ${beatIndex}, "vision": "...", "audio": "...", "prompt": "20-40 word Luma prompt following exact structure", "model": "Ray3.14 or Ray3", "mode": "Image-to-Video", "quality": "1080p SDR", "aspect": "${analysis.suggestedAspect || "16:9"}", "duration": "5s", "draftCount": 15, "loop": false, "characterRef": "none or @character", "startFrame": "keyframe required", "endFrame": "none", "knownRisk": "...", "fallback": "...", "cutType": "...", "postNotes": "...", "change": "..." }]`;
}

/**
 * Regenerate a single shot using frozen scan + arc context (P12).
 * Skips SCAN and ARC stages entirely — uses the provided frozen data.
 *
 * @param {number} beatIndex - Which shot to regenerate (0-indexed)
 * @param {Object} frozenScan - Locked scan analysis from the parent run
 * @param {Object} frozenArc - Locked arc data from the parent run
 * @param {string} concept
 * @param {string} format
 * @param {string} product
 * @returns {Promise<{shot, validation}>}
 */
export async function rerunShot(beatIndex, frozenScan, frozenArc, concept, format, product) {
  const defaultModel = frozenScan.needsCharacterRef ? "Ray3" : "Ray3.14";

  const rawShots = await callAPI(
    SHOTS_SYSTEM,
    buildSingleShotUser(beatIndex, concept, format, product, frozenScan, frozenArc),
    1
  );

  const shotsArray = normalizeShots(rawShots, defaultModel, frozenScan.suggestedAspect);
  const shot = { ...(shotsArray[0] || {}), beatIndex };

  let validation = validatePrompt(shot.prompt);

  // Auto-fix if score < 50
  if (validation.score < 50) {
    try {
      const fixes = await callAPI(
        FIX_SYSTEM,
        buildFixUser([{ ...validation, shotIndex: 0, name: shot.name }], [shot]),
        0
      );
      const fixed = applyFixes([shot], fixes);
      shot.prompt = fixed[0].prompt;
      validation = validatePrompt(shot.prompt);
    } catch (e) {
      console.warn("Fix pass failed for shot rerun:", e.message);
    }
  }

  return { shot, validation };
}
