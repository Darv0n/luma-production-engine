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
 * @param {Function} onStage - Callback: (stageName, data|null) => void
 *   Called with null when a stage starts, with data when it completes.
 * @returns {Promise<{analysis, arcData, shots, validations}>}
 */
export async function runPipeline(
  concept,
  format,
  product,
  targetDuration,
  onStage
) {
  // ─── STAGE 1: SCAN + TENSION ──────────────────────────────────────
  onStage("scan", null);
  let analysis = await callAPI(
    SCAN_SYSTEM,
    buildScanUser(concept, format, product, targetDuration)
  );
  analysis = normalizeScan(analysis);
  onStage("scan", analysis);

  // ─── STAGE 2: EMOTIONAL ARC ───────────────────────────────────────
  onStage("arc", null);
  let arcData = await callAPI(
    ARC_SYSTEM,
    buildArcUser(concept, format, product, analysis)
  );
  arcData = normalizeArc(arcData);
  onStage("arc", arcData);

  // ─── STAGE 3: SHOT GENERATION ─────────────────────────────────────
  onStage("shots", null);
  const defaultModel = analysis.needsCharacterRef ? "Ray3" : "Ray3.14";
  const rawShots = await callAPI(
    SHOTS_SYSTEM,
    buildShotsUser(concept, format, product, analysis, arcData)
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
