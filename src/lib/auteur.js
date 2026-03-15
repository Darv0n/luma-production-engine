/**
 * AUTEUR ENGINE
 *
 * Translates creative intent into camera language.
 *
 * Two modes:
 *   Director preset — applies a named director's visual grammar to all shots
 *   AI Auteur — Claude reads the full arc and assigns per-shot settings
 *
 * The auteur doesn't override user choices — it proposes.
 * Applied values land in the shot as overridable settings.
 */

import { callAPI } from './api.js';
import { CAMERA_CONTROL_BY_ID } from './camera-controls.js';

// ─── Director presets ─────────────────────────────────────────────────────────

export const DIRECTORS = {
  kubrick: {
    name: 'Kubrick',
    traits: 'Symmetry, cold precision, slow zoom, tripod discipline, geometric framing',
    dynamicRange: 'standard',
    arcMap: {
      opening:    'static',
      tension:    'zoom_in',
      floor:      'pull_out',
      pivot:      'push_in',
      resolution: 'static',
      terminal:   'zoom_out',
    },
    fallback: 'static',
    energy: 'still',
    mood: 'cold',
  },
  malick: {
    name: 'Malick',
    traits: 'Natural light, sweeping crane, golden hour HDR, humanity inside nature',
    dynamicRange: 'hdr',
    arcMap: {
      opening:    'aerial',
      tension:    'crane_down',
      floor:      'pedestal_down',
      pivot:      'crane_up',
      resolution: 'pull_out',
      terminal:   'aerial',
    },
    fallback: 'crane_up',
    energy: 'building',
    mood: 'warm',
  },
  wong_kar_wai: {
    name: 'Wong Kar-wai',
    traits: 'Handheld intimacy, warm saturated HDR, push in on emotion, slow motion blur',
    dynamicRange: 'hdr',
    arcMap: {
      opening:    'handheld',
      tension:    'push_in',
      floor:      'push_in',
      pivot:      'handheld',
      resolution: 'pull_out',
      terminal:   'static',
    },
    fallback: 'handheld',
    energy: 'urgent',
    mood: 'warm',
  },
  lynch: {
    name: 'Lynch',
    traits: 'Uncanny stillness, practical lighting, sudden push, dutch angle at threshold',
    dynamicRange: 'standard',
    arcMap: {
      opening:    'static',
      tension:    'static',
      floor:      'push_in',
      pivot:      'dolly_zoom',
      resolution: 'static',
      terminal:   'pull_out',
    },
    fallback: 'static',
    energy: 'still',
    mood: 'unsettling',
  },
  fincher: {
    name: 'Fincher',
    traits: 'Precise engineered movement, overhead reveals, cold desaturated, mechanical push',
    dynamicRange: 'standard',
    arcMap: {
      opening:    'overhead',
      tension:    'push_in',
      floor:      'push_in',
      pivot:      'overhead',
      resolution: 'pull_out',
      terminal:   'static',
    },
    fallback: 'push_in',
    energy: 'building',
    mood: 'cold',
  },
  villeneuve: {
    name: 'Villeneuve',
    traits: 'Epic HDR scale, intimate stillness, slow crane, contemplative wide shots',
    dynamicRange: 'hdr',
    arcMap: {
      opening:    'aerial',
      tension:    'static',
      floor:      'static',
      pivot:      'push_in',
      resolution: 'crane_up',
      terminal:   'pull_out',
    },
    fallback: 'static',
    energy: 'still',
    mood: 'epic',
  },
};

export const DIRECTOR_LIST = Object.entries(DIRECTORS).map(([id, d]) => ({
  id,
  name: d.name,
  traits: d.traits,
}));

/**
 * Map an arc beat position (0-1) to a label for the arcMap lookup.
 */
function beatLabel(beat, arcData) {
  const pivot = arcData?.pivotPosition ?? 0.6;
  const pos = beat?.position ?? 0;
  if (pos <= 0.15) return 'opening';
  if (pos <= 0.35) return 'tension';
  if (pos < pivot - 0.05) return 'floor';
  if (Math.abs(pos - pivot) <= 0.12) return 'pivot';
  if (pos <= 0.85) return 'resolution';
  return 'terminal';
}

/**
 * Apply a named director preset to all shots.
 * Returns updated shot array — does not mutate.
 */
export function applyDirectorPreset(shots, arcData, directorId) {
  const director = DIRECTORS[directorId];
  if (!director) return shots;

  return shots.map((shot, i) => {
    const beat = arcData?.beats?.[shot.beatIndex ?? i];
    const label = beatLabel(beat, arcData);
    const camera = director.arcMap[label] || director.fallback;

    return {
      ...shot,
      cameraControl: camera,
      dynamicRange: director.dynamicRange,
      _auteurApplied: directorId,
    };
  });
}

// ─── AI Auteur ────────────────────────────────────────────────────────────────

const AI_AUTEUR_SYSTEM = `You are a master cinematographer. You receive a production arc and shot list and return precise camera assignments for each shot.

CAMERA CONTROLS available (use only these ids):
static, handheld, zoom_in, zoom_out, pan_left, pan_right, tilt_up, tilt_down,
push_in, pull_out, truck_left, truck_right, pedestal_up, pedestal_down,
orbit_left, orbit_right, crane_up, crane_down, roll_left, roll_right,
dolly_zoom, bolt_cam, aerial_drone, tiny_planet, elevator_doors,
low_angle, high_angle, ground_level, eye_level, over_the_shoulder, pov, overhead, aerial, selfie

RULES:
- Camera motion must serve emotion. Push toward intensity. Pull toward release. Still for observation.
- Match dynamic range to emotional temperature: hdr for warmth/grandeur, standard for cold/clinical
- No repeated camera control on adjacent shots unless intentional
- Pivot shot gets the most decisive movement
- Floor shot gets the most oppressive/static framing

Return ONLY valid JSON array — one entry per shot in order.`;

function buildAiAuteurPrompt(shots, arcData, concept) {
  return `CONCEPT: "${concept}"
ARC SHAPE: ${arcData?.shape || '—'}
HANDLE: "${arcData?.handle || '—'}"
PIVOT: "${arcData?.pivotImage || '—'}"
OPENING STATE: ${arcData?.openingState || '—'} → FLOOR: ${arcData?.floor || '—'} → TERMINAL: ${arcData?.terminalState || '—'}

BEATS:
${(arcData?.beats || []).map((b, i) => `  ${i + 1}. [${((b.position || 0) * 100).toFixed(0)}%] ${b.feeling} — ${b.description} — CHANGE: ${b.change || '—'}`).join('\n')}

SHOTS (${shots.length} total):
${shots.map((s, i) => `  ${i + 1}. "${s.name}" — ${s.vision?.slice(0, 80) || s.prompt?.slice(0, 80)}`).join('\n')}

Assign camera settings for each shot. Return JSON array:
[{
  "shotIndex": 0,
  "cameraControl": "push_in",
  "dynamicRange": "standard",
  "rationale": "brief reason"
}]`;
}

// ─── Phase 2: Auteur Brainstorm ───────────────────────────────────────────────

const BRAINSTORM_SYSTEM = `You are a creative director evaluating variation themes for a single shot in a narrative arc. Return ONLY valid JSON.`;

/**
 * Generate arc-aware brainstorm variations using Claude.
 * Has full arc context — better than Luma's generic Brainstorm.
 */
export async function generateAuteurBrainstorm(shot, arcData, concept, callApi) {
  const bl = beatLabel(arcData?.beats?.[shot.beatIndex ?? 0], arcData);
  const prompt = `CONCEPT: "${concept}"
ARC: ${arcData?.shape} — HANDLE: "${arcData?.handle}"
SHOT "${shot.name}" at ${bl.toUpperCase()} position.
CURRENT PROMPT: "${shot.prompt}"
CHANGE REQUIRED: ${shot.change}
PIVOT: "${arcData?.pivotImage}"

Generate 4 variation directions that serve the ${bl.toUpperCase()} emotional position in this arc.

Return JSON array: [{ "theme": "name", "direction": "one sentence", "prompt": "20-40 word Luma prompt", "rationale": "why this serves ${bl}" }]`;

  const raw = await callApi(BRAINSTORM_SYSTEM, prompt, 0.7);
  if (Array.isArray(raw)) return raw;
  try { const m = JSON.stringify(raw).match(/\[[\s\S]*\]/); return JSON.parse(m?.[0] || '[]'); }
  catch { return []; }
}

/**
 * Evaluate brainstorm options and select the best for the arc position.
 */
export async function evaluateBrainstormOptions(options, shot, arcData, concept, callApi) {
  if (!options?.length) return null;
  const bl = beatLabel(arcData?.beats?.[shot.beatIndex ?? 0], arcData);
  const prompt = `ARC: ${arcData?.shape} — SHOT "${shot.name}" at ${bl.toUpperCase()}
CHANGE: ${shot.change} | PIVOT: "${arcData?.pivotImage}"

OPTIONS:
${options.map((o, i) => `${i + 1}. ${o.theme}: ${o.direction}`).join('\n')}

Select the option that most precisely serves the ${bl} position.
Return JSON: { "selected": 1, "rationale": "one sentence why" }`;

  const raw = await callApi(BRAINSTORM_SYSTEM, prompt, 0.3);
  try {
    const d = typeof raw === 'object' ? raw : JSON.parse(JSON.stringify(raw));
    const idx = Math.max(0, (d.selected || 1) - 1);
    return { ...options[idx], auteurRationale: d.rationale };
  } catch { return options[0]; }
}

// ─── Phase 3: Pivot detection + prompt ───────────────────────────────────────

/**
 * Detect which shot is the pivot (closest to arcData.pivotPosition).
 */
export function detectPivotShot(shots, arcData) {
  if (!arcData?.pivotPosition || !shots?.length) return -1;
  const pivot = arcData.pivotPosition;
  let closest = -1, minDist = Infinity;
  shots.forEach((s, i) => {
    const beat = arcData?.beats?.[s.beatIndex ?? i];
    if (!beat) return;
    const dist = Math.abs((beat.position || 0) - pivot);
    if (dist < minDist) { minDist = dist; closest = i; }
  });
  return closest;
}

/**
 * Build an enhanced prompt for the reasoning model on the pivot shot.
 * The reasoning model handles more complexity — this prompt is richer.
 */
export function buildPivotPrompt(shot, arcData) {
  return `${shot.prompt}

PIVOT CONTEXT: This is the hinge moment where ${arcData?.floor} becomes ${arcData?.terminalState}.
The pivot image: "${arcData?.pivotImage}"
The change that must happen: ${shot.change}
The emotional direction reverses here — this frame must carry the full weight of the turn.`;
}

/**
 * Apply AI Auteur — calls Claude to assign per-shot camera settings.
 * @param {Array} shots
 * @param {Object} arcData
 * @param {string} concept
 * @returns {Promise<Array>} updated shots
 */
export async function applyAiAuteur(shots, arcData, concept) {
  const raw = await callAPI(AI_AUTEUR_SYSTEM, buildAiAuteurPrompt(shots, arcData, concept), 0.3);

  // callAPI already parses JSON — handle both parsed and raw string cases
  let assignments;
  if (Array.isArray(raw)) {
    assignments = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    assignments = raw.assignments || raw.shots || Object.values(raw).find((v) => Array.isArray(v)) || [];
  } else if (typeof raw === 'string') {
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      assignments = JSON.parse(match?.[0] || raw);
    } catch {
      throw new Error('AI Auteur response parse failed');
    }
  } else {
    throw new Error('AI Auteur response parse failed');
  }

  return shots.map((shot, i) => {
    const a = assignments.find((x) => x.shotIndex === i) || assignments[i];
    if (!a) return shot;
    // Only apply if the camera control is valid
    const validCamera = CAMERA_CONTROL_BY_ID[a.cameraControl] ? a.cameraControl : null;
    return {
      ...shot,
      cameraControl: validCamera ?? shot.cameraControl,
      dynamicRange: a.dynamicRange === 'hdr' ? 'hdr' : 'standard',
      _auteurApplied: 'ai',
      _auteurRationale: a.rationale,
    };
  });
}
