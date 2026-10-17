/**
 * SHOTS STAGE PROMPTS
 *
 * The most critical prompt in the pipeline. This is where the inner model
 * must follow Luma's exact rules for prompt structure, word count, verb form,
 * positive prompting, and dead word avoidance.
 *
 * Every rule in the system prompt exists because Luma's model processes
 * language in specific ways. These are architectural facts, not preferences.
 */

export const SHOTS_SYSTEM = `You are a master cinematographer writing shot descriptions for Luma Dream Machine AI video generation.

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

9. CAMERA MOTION — specify 1-2 max from this list (use exact terms for best accuracy):
   Static | Pan Left/Right | Tilt Up/Down | Push In | Pull Out | Orbit Left/Right
   Crane Up/Down | Truck Left/Right | Zoom In/Out | Bolt Cam | Aerial Drone
   Pedestal Up/Down | Roll Left/Right | Elevator | Tiny Planet
   Also valid: "dolly zoom" "steadicam tracking" "handheld sway" "FPV drone" "rack focus"
   "Static" is the most powerful choice when the composition is strong enough.

10. LIGHTING must be specific: "golden hour backlight" not just "good lighting".

11. EQUIPMENT PRIMES — optional final word, appended after mood. Match to concept tone:
    Portrait/character warmth:  "Kodak Portra 400, 85mm portrait lens"
    Cinema narrative:           "Shot on ARRI Alexa, 50mm lens"
    Documentary/raw truth:      "35mm handheld, Kodak Vision3 250D"
    Nostalgic/indie:            "16mm film grain, Kodak Vision3 500T"
    Night/urban:                "anamorphic bokeh, practical lights"
    Product detail:             "macro lens, soft studio light"
    These push the model toward professional footage quality. Only use if it serves the concept.

Return ONLY valid JSON array.`;

export function buildShotsUser(concept, format, product, analysis, arcData, characters = [], creativeDirection = null) {
  const defaultModel = analysis.needsCharacterRef ? "Ray3" : "Ray3.14";

  const characterHint = characters.length > 0
    ? `\nREGISTERED CHARACTERS (use these names in characterRef fields, set model to Ray3 for these shots):\n${characters.map(c => `  @${c.name}${c.description ? ` — ${c.description}` : ""}`).join("\n")}\n`
    : "";

  return `CONCEPT: "${concept}"
FORMAT: ${format || "30s"}
PRODUCT: ${product || "none"}
DEFAULT MODEL: ${defaultModel}
SUGGESTED ASPECT: ${analysis.suggestedAspect}
HANDLE: "${analysis.handle}"
ARC SHAPE: ${arcData.shape}
ARC BEATS:
${(arcData.beats || []).map((b, i) => `  ${i + 1}. [${((b.position || 0) * 100).toFixed(0)}%] ${b.feeling || "—"} — ${b.description || "—"} — CHANGE: ${b.change || "—"}`).join("\n")}
PIVOT POSITION: ${arcData.pivotPosition}
PIVOT IMAGE: "${arcData.pivotImage}"
CONTRAST AT PIVOT: "${arcData.contrast}"
${creativeDirection ? `
CREATIVE DIRECTION:
  MOOD: ${creativeDirection.mood || 'neutral'}
  ENERGY: ${creativeDirection.energy || 'building'}${creativeDirection.vision ? `
  VISION: ${creativeDirection.vision}` : ''}
` : ''}${characterHint}
Generate exactly ${arcData.beats?.length || 6} shots mapping 1:1 to the arc beats above.

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
  "change": "what CHANGES in this shot (the hierarchy: revelation > emotion > action > movement > texture)",
  "equipmentPrime": "e.g. 'Kodak Portra 400, 85mm portrait lens' or null if not needed",
  "subtitle": "for LUMA TRANSLATE / text-on-screen concepts: the exact text to burn in, or null"
}]`;
}

/**
 * Normalize shots response — handles wrapped arrays and missing fields.
 */
export function normalizeShots(shots, defaultModel, suggestedAspect) {
  // API might return {shots:[...]} instead of [...]
  let arr = Array.isArray(shots)
    ? shots
    : shots?.shots ||
      shots?.data ||
      Object.values(shots || {}).find((v) => Array.isArray(v)) ||
      [];

  return arr.map((s, i) => ({
    name: s.name || "Shot " + (i + 1),
    beatIndex: s.beatIndex ?? i,
    vision: s.vision || "",
    audio: s.audio || "",
    prompt: s.prompt || "",
    model: s.model || defaultModel || "Ray3.14",
    mode: s.mode || "Image-to-Video",
    quality: s.quality || "1080p SDR",
    aspect: s.aspect || suggestedAspect || "16:9",
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
    change: s.change || "",
    // ─── SETUP panel fields ───────────────────────────────────────────────
    cameraControl: s.cameraControl || null,          // camera control preset id
    dynamicRange: s.dynamicRange || "standard",      // "standard" | "hdr"
    enhance: s.enhance !== false,                    // prompt enhancement (default on)
    audioPrompt: s.audioPrompt || s.audio || "",     // audio generation prompt
    negativeAudioPrompt: s.negativeAudioPrompt || "music, speech, sound effects",
    autoUpscale: s.autoUpscale || "1080p",           // null | "720p" | "1080p" | "4k"
    autoAudio: s.autoAudio !== false,                // chain audio after final render
    autoExtend: s.autoExtend || false,               // chain to next shot via last_frame
    auteurMode: s.auteurMode || "none",              // "none" | "user" | "ai" (future)
    keyframeId: s.keyframeId || null,               // references project.keyframes[].id
    equipmentPrime: s.equipmentPrime || null,       // Kodak Portra 400, ARRI Alexa, etc.
    subtitle: s.subtitle || null,                   // text to burn in (for LUMA TRANSLATE etc.)
  }));
}
