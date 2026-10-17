/**
 * GEMINI CLIENT
 *
 * Google Gemini integration for the Luma Production Engine.
 * Primary role: Quality auditor with native video understanding.
 *
 * Gemini 2.0 Flash can watch mp4 files natively — no frame extraction,
 * no transcription. Hand it a video URL and it reasons about motion,
 * timing, emotional beat, camera work, secondary physics.
 *
 * Strengths vs Claude:
 * - Native video input (Claude sees frames, Gemini watches motion)
 * - Fast + cheap for evaluation tasks
 * - Second perspective on creative quality
 *
 * Role in the Auteur loop:
 * Claude directs → Luma Agent generates → Gemini audits → Claude decides
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ─── Model registry ───────────────────────────────────────────────────────────
// Confirmed available on this key (2026-03-16)
export const MODELS = {
  // Text + Vision (evaluation, reasoning, prompting)
  FLASH:          'gemini-2.5-flash',          // Fast evaluation, cheap
  PRO:            'gemini-2.5-pro',            // Deep reasoning, expensive
  GEMINI_3_FLASH: 'gemini-3-flash-preview',    // Latest generation, fast
  GEMINI_3_PRO:   'gemini-3-pro-preview',      // Latest generation, powerful

  // IMAGE GENERATION — These ARE the Luma Nano Banana models
  // The Luma Agent calls these when you ask for "Nano Banana Pro"
  NANO_BANANA:     'gemini-2.5-flash-image',            // Nano Banana (standard)
  NANO_BANANA_PRO: 'gemini-3-pro-image-preview',        // Nano Banana Pro (premium)
  NANO_BANANA_PRO2: 'nano-banana-pro-preview',          // Nano Banana Pro (alt)
  NANO_BANANA_2:   'gemini-3.1-flash-image-preview',    // Nano Banana 2 (latest)
};

const DEFAULT_MODEL = MODELS.FLASH;
const VISION_MODEL = MODELS.FLASH;
const IMAGE_MODEL = MODELS.NANO_BANANA_PRO;  // Default keyframe generation model

// ─── Core API call ────────────────────────────────────────────────────────────

async function callGemini(model, contents, apiKey, options = {}) {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens ?? 2048,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── JSON extraction (same 3-strategy pattern as api.js) ─────────────────────

function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    return JSON.parse(cleaned);
  } catch {}
  const start = text.indexOf('{');
  if (start === -1) return {};
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return {}; }
    }
  }
  return {};
}

// ─── Primary: Evaluate a video clip against a shot brief ─────────────────────

/**
 * Watch a generated video clip and evaluate it against the shot brief.
 * Uses Gemini's native video understanding — sees motion, timing, physics.
 *
 * @param {string} videoUrl - URL to the generated video (mp4)
 * @param {Object} shot - Shot object { name, prompt, cutType, aspect }
 * @param {Object} arcData - Arc data { beats, pivotPosition }
 * @param {string} apiKey - Gemini API key
 * @returns {{ score, assessment, motion, issues, recommendation }}
 */
export async function evaluateVideoClip(videoUrl, shot, arcData, apiKey) {
  const beat = arcData?.beats?.[shot.beatIndex ?? 0];
  const arcPos = beat ? `${(beat.position * 100).toFixed(0)}% — ${beat.feeling}` : 'unknown';

  const systemInstruction = `You are a quality auditor for AI-generated video advertising content.
You evaluate Dream Machine / Luma AI generations against their creative brief.
You have native video understanding — analyze motion, camera work, timing, physics, emotional resonance.
Be specific and critical. This is for competition-level ad production.
Return ONLY valid JSON.`;

  const userPrompt = `Watch this video clip and evaluate it against the production brief.

SHOT: "${shot.name || 'Unnamed'}"
PROMPT: "${shot.prompt}"
ARC POSITION: ${arcPos}
BEAT: ${beat?.description || 'N/A'}
ASPECT: ${shot.aspect || '16:9'}

Evaluate:
1. Does the camera motion match the prompt?
2. Is there secondary motion (wind, fabric, particles, reflections)?
3. Does the emotional tone match the arc position?
4. Any technical artifacts (morphing, extra digits, identity drift)?
5. Does the shot advance the narrative?

Return JSON:
{
  "score": 0-100,
  "assessment": "2-3 sentences",
  "motion": "describe actual camera motion observed",
  "secondary_motion": true/false,
  "issues": ["specific issue 1", "specific issue 2"],
  "recommendation": "approve" | "regenerate" | "modify"
}`;

  try {
    // Gemini native video input via URL
    const contents = [{
      role: 'user',
      parts: [
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: videoUrl,
          },
        },
        { text: userPrompt },
      ],
    }];

    const text = await callGemini(VISION_MODEL, contents, apiKey, { temperature: 0.2 });
    const parsed = extractJSON(text);
    return normalizeEvaluation(parsed);
  } catch (e) {
    // Fallback: text-only evaluation without video
    return {
      score: 0,
      assessment: `Video evaluation failed: ${e.message}`,
      motion: 'unknown',
      secondary_motion: false,
      issues: ['evaluation-error'],
      recommendation: 'regenerate',
    };
  }
}

/**
 * Evaluate a screenshot (base64) when video URL isn't available yet.
 * Fallback to frame-based evaluation like Claude does.
 */
export async function evaluateFrame(screenshotB64, shot, arcData, apiKey) {
  const beat = arcData?.beats?.[shot.beatIndex ?? 0];
  const arcPos = beat ? `${(beat.position * 100).toFixed(0)}% — ${beat.feeling}` : 'unknown';

  const userPrompt = `Evaluate this generation frame against the production brief.

SHOT: "${shot.name || 'Unnamed'}"
PROMPT: "${shot.prompt}"
ARC POSITION: ${arcPos}
ASPECT: ${shot.aspect || '16:9'}

Score and return JSON:
{
  "score": 0-100,
  "assessment": "2-3 sentences",
  "issues": ["issue 1"],
  "recommendation": "approve" | "regenerate" | "modify"
}`;

  try {
    const contents = [{
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: screenshotB64,
          },
        },
        { text: userPrompt },
      ],
    }];

    const text = await callGemini(VISION_MODEL, contents, apiKey, { temperature: 0.2 });
    const parsed = extractJSON(text);
    return normalizeEvaluation(parsed);
  } catch (e) {
    return {
      score: 0,
      assessment: `Frame evaluation failed: ${e.message}`,
      issues: ['evaluation-error'],
      recommendation: 'regenerate',
    };
  }
}

// ─── Second opinion: cross-validate Claude's evaluation ──────────────────────

/**
 * Compare Claude's evaluation with Gemini's and return a consensus.
 * When they agree → higher confidence. When they disagree → flag for human.
 *
 * @param {Object} claudeEval - { score, assessment, issues, recommendation }
 * @param {Object} geminiEval - { score, assessment, issues, recommendation }
 * @returns {{ score, assessment, consensus, confidence, recommendation }}
 */
export function crossValidate(claudeEval, geminiEval) {
  const avgScore = Math.round((claudeEval.score + geminiEval.score) / 2);
  const scoreDelta = Math.abs(claudeEval.score - geminiEval.score);

  // High agreement (within 15 points)
  const highAgreement = scoreDelta <= 15;

  // Both recommend the same action
  const actionAgreement = claudeEval.recommendation === geminiEval.recommendation;

  const confidence = highAgreement && actionAgreement ? 'HIGH'
    : highAgreement || actionAgreement ? 'MEDIUM'
    : 'LOW';

  // When confidence is LOW, flag for human regardless of score
  const recommendation = confidence === 'LOW'
    ? 'human-review'
    : avgScore >= 80 ? 'approve'
    : avgScore >= 50 ? 'modify'
    : 'regenerate';

  const allIssues = [...new Set([
    ...(claudeEval.issues || []),
    ...(geminiEval.issues || []),
  ])];

  return {
    score: avgScore,
    scoreDelta,
    assessment: highAgreement
      ? claudeEval.assessment
      : `Claude: ${claudeEval.assessment} | Gemini: ${geminiEval.assessment}`,
    consensus: highAgreement,
    confidence,
    issues: allIssues,
    recommendation,
    claudeScore: claudeEval.score,
    geminiScore: geminiEval.score,
  };
}

// ─── Prompting assistant: write better Luma prompts ──────────────────────────

/**
 * Ask Gemini to rewrite a failed prompt based on the issues found.
 * Different perspective from Claude — useful when Claude's rewrites don't work.
 *
 * @param {string} originalPrompt - The prompt that produced a bad result
 * @param {Array} issues - Issues identified in evaluation
 * @param {Object} shot - Shot context
 * @param {string} apiKey
 * @returns {string} Improved prompt
 */
export async function rewritePrompt(originalPrompt, issues, shot, apiKey) {
  const userPrompt = `Rewrite this Luma Dream Machine video prompt to fix identified issues.

ORIGINAL PROMPT: "${originalPrompt}"
ISSUES: ${issues.join(', ')}
SHOT NAME: "${shot.name}"
ARC POSITION: ${shot.beatIndex ?? 0}

Luma prompt rules:
- Positive prompting only (no "no X" or "avoid X")
- 20-40 words optimal
- Structure: Shot type → Subject + verb → Secondary motion → Camera motion → Lighting → Mood
- One subject, one action, one camera move
- Include secondary motion (wind, fabric, particles, reflections)
- Mid-action verbs ("running" not "begins to run")
- Avoid: vibrant, cinematic, stunning, beautiful, amazing, masterpiece

Return ONLY the rewritten prompt. No explanation.`;

  try {
    const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];
    const text = await callGemini(DEFAULT_MODEL, contents, apiKey, { temperature: 0.4 });
    return text.trim().replace(/^["']|["']$/g, ''); // Strip surrounding quotes
  } catch {
    return originalPrompt; // Return original if rewrite fails
  }
}

// ─── Quick text query ─────────────────────────────────────────────────────────

/**
 * General-purpose Gemini text query.
 * Use when you want a second opinion without vision.
 */
export async function query(prompt, apiKey, options = {}) {
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  return callGemini(DEFAULT_MODEL, contents, apiKey, options);
}

// ─── Normalize ────────────────────────────────────────────────────────────────

function normalizeEvaluation(raw) {
  const d = typeof raw === 'object' ? raw : {};
  return {
    score: typeof d.score === 'number' ? Math.max(0, Math.min(100, d.score)) : 0,
    assessment: d.assessment || 'No assessment.',
    motion: d.motion || 'Not observed',
    secondary_motion: d.secondary_motion ?? false,
    issues: Array.isArray(d.issues) ? d.issues : [],
    recommendation: ['approve', 'regenerate', 'modify'].includes(d.recommendation)
      ? d.recommendation
      : 'regenerate',
  };
}

// ─── Keyframe image generation via Nano Banana ────────────────────────────────

/**
 * Generate a keyframe image using Nano Banana Pro (same model Luma Realms uses).
 * This is the breakthrough — we can generate keyframes programmatically
 * without going through the Realms UI.
 *
 * @param {string} imagePrompt - Description of the keyframe
 * @param {Object} options - { model, aspectRatio, numImages }
 * @param {string} apiKey
 * @returns {{ imageBase64, mimeType, prompt }} or null on failure
 */
export async function generateKeyframe(imagePrompt, apiKey, options = {}) {
  const model = options.model || IMAGE_MODEL;
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  // The Nano Banana models ignore aspectRatio in generationConfig — orientation
  // must be enforced through the text prompt. Append a hard instruction.
  const aspectRatio = options.aspectRatio || '9:16'; // default portrait
  const orientationInstruction = aspectRatio === '9:16'
    ? ' Portrait orientation, 9:16 vertical format, taller than wide.'
    : aspectRatio === '16:9'
    ? ' Landscape orientation, 16:9 horizontal format, wider than tall.'
    : '';

  // Default aesthetic prime for character/portrait keyframes (Wonder Years / Luma production standard)
  // Baked from LUMA1 photorealism lexicon: Kodak Portra 400 = portrait warmth + skin tones,
  // 85mm = compressed perspective + beautiful faces, both confirmed quality drivers.
  // Only append if not already present and not explicitly disabled.
  const aestheticPrime = options.aestheticPrime !== false && !imagePrompt.toLowerCase().includes('kodak') && !imagePrompt.toLowerCase().includes('35mm') && !imagePrompt.toLowerCase().includes('arri')
    ? ' Kodak Portra 400, 85mm portrait lens.'
    : '';

  const finalPrompt = imagePrompt + orientationInstruction + aestheticPrime;

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: finalPrompt }],
    }],
    generationConfig: {
      // Image generation models only accept responseModalities — aspect ratio
      // is controlled entirely through the text prompt (API fields rejected with 400)
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Nano Banana error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];

    // Find the image part
    const imagePart = parts.find(p => p.inlineData);
    if (!imagePart) return null;

    return {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
      prompt: imagePrompt,
      model,
    };
  } catch (e) {
    throw new Error(`Keyframe generation failed: ${e.message}`);
  }
}

/**
 * Generate multiple keyframe variations using Nano Banana.
 * @param {string} imagePrompt
 * @param {number} count - Number of variations
 * @param {string} apiKey
 * @returns {Array<{ imageBase64, mimeType, prompt }>}
 */
export async function generateKeyframeVariations(imagePrompt, count = 4, apiKey, options = {}) {
  const results = [];
  const promises = Array.from({ length: count }, () =>
    generateKeyframe(imagePrompt, apiKey, options).catch(() => null)
  );
  const settled = await Promise.all(promises);
  return settled.filter(Boolean);
}

// ─── Check API key works ──────────────────────────────────────────────────────

export async function checkGemini(apiKey) {
  try {
    const text = await query('Respond with exactly: {"status":"ok"}', apiKey);
    const parsed = extractJSON(text);
    return { ok: parsed?.status === 'ok', raw: text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
