/**
 * PLATFORM BRIEF BUILDER
 *
 * Generates the handoff document for HYBRID workflow:
 * API draft selection → Luma platform final render.
 *
 * Approved shots get their draft generation ID (reusable as keyframe frame0
 * for I2V continuation at full quality on the platform).
 *
 * Unapproved shots get full generation settings for fresh platform generation.
 * Character ref shots are flagged as requiring upload on the platform.
 */

const eq = "=".repeat(80);
const dash = "─".repeat(40);

/**
 * @param {Array} shots — shot objects from the run
 * @param {Object} draftStates — { [idx]: { state, id, videoUrl, approved } }
 * @param {Object} arcData — for handle/arc context
 * @param {string} concept — project concept
 */
export function buildPlatformBrief(shots, draftStates, arcData, concept) {
  const approved = shots.filter((_, i) => draftStates[i]?.approved);
  const pending = shots.filter(
    (s, i) =>
      !draftStates[i]?.approved &&
      !(s.characterRef && s.characterRef !== "none")
  );
  const charRefShots = shots.filter(
    (s) => s.characterRef && s.characterRef !== "none"
  );

  const now = new Date().toLocaleString();

  let out = `${eq}

  LUMA DREAM MACHINE — PLATFORM BRIEF
  Hybrid Workflow: API Draft Selection → Platform Final Render

  Generated:  ${now}
  Handle:     "${arcData?.handle || "—"}"
  Arc:        ${arcData?.shape || "—"} — Pivot: "${arcData?.pivotImage || "—"}"

  Approved for platform render:  ${approved.length} shots
  Generate fresh on platform:    ${pending.length} shots
  Character ref required:        ${charRefShots.length} shots
  Total:                         ${shots.length} shots

${eq}

`;

  // ─── Approved shots ─────────────────────────────────────────────────────────
  if (approved.length > 0) {
    out += `APPROVED SHOTS — CONTINUE FROM DRAFT
${dash}
Use the Draft ID as keyframe (frame0) in Image-to-Video mode on the platform.
This locks your approved composition and upgrades to full quality render.

`;
    approved.forEach((s, _) => {
      const idx = shots.indexOf(s);
      const d = draftStates[idx] || {};
      out += `SHOT ${String(idx + 1).padStart(2, "0")}: ${s.name.toUpperCase()}
  Draft ID:   ${d.id || "—"}
  ↳ Open platform → New Generation → Image-to-Video → paste Draft ID as start frame
  Model:      ${s.model} (${s.model === "Ray3" ? "ray-2" : "ray-flash-2"})
  Quality:    1080p SDR (upgrade from 540p draft)
  Prompt:     "${s.prompt}"
  Settings:   ${s.aspect} · ${s.duration} · Loop: ${s.loop ? "Yes" : "No"}
  Risk:       ${s.knownRisk || "Standard"}

`;
    });
  }

  // ─── Fresh platform shots ──────────────────────────────────────────────────
  if (pending.length > 0) {
    out += `${eq}

PLATFORM-ONLY SHOTS — GENERATE FRESH
${dash}
These shots were not approved from the API draft pass.
Generate directly on the platform using the settings below.

`;
    pending.forEach((s) => {
      const idx = shots.indexOf(s);
      const d = draftStates[idx] || {};
      out += `SHOT ${String(idx + 1).padStart(2, "0")}: ${s.name.toUpperCase()}
  Status:     ${d.state === "completed" ? "Draft exists (not approved)" : d.state === "failed" ? "Draft failed" : "No draft generated"}
  Model:      ${s.model} (${s.model === "Ray3" ? "ray-2" : "ray-flash-2"})
  Mode:       ${s.mode}
  Quality:    1080p SDR
  Prompt:     "${s.prompt}"
  Settings:   ${s.aspect} · ${s.duration} · Loop: ${s.loop ? "Yes" : "No"}
  Risk:       ${s.knownRisk || "Standard"}
  Fallback:   ${s.fallback || "Iterate with modified prompt"}

`;
    });
  }

  // ─── Character ref shots ────────────────────────────────────────────────────
  if (charRefShots.length > 0) {
    out += `${eq}

CHARACTER REF SHOTS — REQUIRES PLATFORM UPLOAD
${dash}
These shots use Character Reference, which requires a face photo upload
on the Luma platform. API drafts were generated as T2V only (no face lock).
Upload the character ref before generating for face consistency.

`;
    charRefShots.forEach((s) => {
      const idx = shots.indexOf(s);
      out += `SHOT ${String(idx + 1).padStart(2, "0")}: ${s.name.toUpperCase()}
  ⚠  Character Ref: ${s.characterRef}
  ↳ Platform → Settings → Character Reference → upload face photo → tag ${s.characterRef}
  Model:      Ray3 (ray-2) — required for character reference
  Mode:       ${s.mode}
  Quality:    1080p SDR
  Prompt:     "${s.prompt}"
  Settings:   ${s.aspect} · ${s.duration} · Loop: ${s.loop ? "Yes" : "No"}

`;
    });
  }

  out += `${eq}

ASSEMBLY NOTES
${dash}
  □ Render approved shots first — these are your anchors
  □ Color match all shots to approved benchmark at LUT 20-35%
  □ Add audio in post — no native audio from Ray models
  □ Text overlays in NLE (never in Luma prompts)
  □ DaVinci Resolve recommended for assembly

${eq}
`;

  return out;
}
