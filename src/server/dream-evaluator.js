/**
 * DREAM EVALUATOR
 *
 * Claude Vision evaluation of Dream Machine generation results.
 * The evaluator embodies the same creative vision as the auteur —
 * consistent perspective between direction and evaluation.
 *
 * Returns: { score: 0-100, assessment, issues[], recommendation }
 */

/**
 * Evaluate a generation screenshot against the shot brief.
 *
 * @param {string} screenshotB64 - Base64 PNG of the generation result
 * @param {Object} shot - Shot object (prompt, name, cutType, etc.)
 * @param {Object} arcData - Arc data (shape, pivotPosition, beats)
 * @param {Object} vision - Creative direction vision settings
 * @param {string} anthropicKey - API key for Claude
 * @returns {Promise<{ score, assessment, issues, recommendation }>}
 */
export async function evaluateGeneration(screenshotB64, shot, arcData, vision, anthropicKey) {
  const beat = arcData?.beats?.[shot.beatIndex ?? 0];
  const pos = beat ? ((beat.position || 0) * 100).toFixed(0) : '?';

  const systemPrompt = buildEvaluatorPrompt(vision);
  const userPrompt = `Evaluate this Dream Machine generation against the production brief.

SHOT: "${shot.name || 'Unnamed'}"
PROMPT: "${shot.prompt}"
ARC POSITION: ${pos}% — ${beat?.feeling || 'unknown'}
BEAT DESCRIPTION: ${beat?.description || 'N/A'}
CUT TYPE: ${shot.cutType || 'hard cut'}
ASPECT: ${shot.aspect || '16:9'}

Score 0-100 based on:
- Composition fidelity to prompt (camera, framing, subject)
- Emotional alignment with arc position
- Technical quality (no artifacts, morphing, extra digits)
- Secondary motion presence (physics cues)
- Overall production readiness

Return JSON:
{
  "score": 0-100,
  "assessment": "2-3 sentence evaluation",
  "issues": ["specific issue 1", "specific issue 2"],
  "recommendation": "approve" | "regenerate" | "modify"
}

recommendation guide:
- score >= 80: "approve"
- score 50-79 with fixable issues: "modify"
- score < 50 or fundamental problems: "regenerate"`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshotB64,
              },
            },
            { type: 'text', text: userPrompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Evaluation API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '';

    // Parse JSON from response (defensive)
    const parsed = extractJSON(text);
    return normalizeEvaluation(parsed);
  } catch (e) {
    return {
      score: 0,
      assessment: `Evaluation failed: ${e.message}`,
      issues: ['evaluation-error'],
      recommendation: 'regenerate',
    };
  }
}

function buildEvaluatorPrompt(vision) {
  let prompt = `You are a production quality evaluator for AI-generated video.
You assess Dream Machine generations against their production brief.
Be precise and critical — this is for ad-quality output.

Scoring guide:
90-100: Production-ready. Minor polish at most.
70-89: Good foundation, needs refinement (modify with adjusted prompt).
50-69: Partially successful, significant issues need addressing.
0-49: Fundamental problems — regenerate from scratch.

Common issues to check:
- Extra fingers/digits on hands
- Face morphing or identity drift
- Object shape inconsistency
- Camera motion doesn't match brief
- Lighting/mood disconnect from arc position
- Missing secondary motion (static physics)
- Wrong framing/composition for shot type

Return ONLY valid JSON.`;

  if (vision?.vision) {
    prompt += `\n\nCREATIVE VISION: "${vision.vision}"
Evaluate through this lens — does the generation serve this aesthetic?`;
  }

  return prompt;
}

function extractJSON(text) {
  // Strategy 1: direct parse
  try { return JSON.parse(text); } catch {}

  // Strategy 2: strip fences
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    return JSON.parse(cleaned);
  } catch {}

  // Strategy 3: bracket match
  const start = text.indexOf('{');
  if (start === -1) return {};
  let depth = 0;
  let inString = false;
  let escape = false;
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

function normalizeEvaluation(raw) {
  const d = typeof raw === 'object' ? raw : {};
  return {
    score: typeof d.score === 'number' ? Math.max(0, Math.min(100, d.score)) : 0,
    assessment: d.assessment || 'No assessment available.',
    issues: Array.isArray(d.issues) ? d.issues : [],
    recommendation: ['approve', 'regenerate', 'modify'].includes(d.recommendation)
      ? d.recommendation
      : 'regenerate',
  };
}
