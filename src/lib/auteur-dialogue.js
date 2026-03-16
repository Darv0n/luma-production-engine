/**
 * AUTEUR DIALOGUE ENGINE
 *
 * Sprint 04: Conversational auteur — replaces one-shot brainstorm
 * with a per-shot dialogue where human and auteur curate each keyframe together.
 *
 * Data types:
 *   DialogueTurn — single message in the conversation
 *   ShotDialogue — full dialogue state for one shot
 *
 * Functions:
 *   generateInitialProposal — first auteur turn for a shot
 *   respondToFeedback       — auteur refines based on human input
 *   requestAlternatives     — generates 3 alternative directions
 *   buildDialogueContext    — serializes approved shots as narrative context
 *   buildAuteurSystemPrompt — builds system prompt with director persona
 */

// ─── Data constructors ──────────────────────────────────────────────────────

export function createDialogueTurn({
  role,
  type,
  message,
  prompt = null,
  settings = null,
  keyframeUrl = null,
  variations = null,
  approved = false,
  evaluation = null,
  screenshotB64 = null,
}) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    role,       // 'auteur' | 'human'
    timestamp: new Date().toISOString(),
    type,       // 'proposal' | 'feedback' | 'approval' | 'alternatives' | 'settings-change' | 'keyframe' | 'check-in' | 'generation-result' | 'decision'
    message,
    prompt,
    settings,
    keyframeUrl,
    variations,
    approved,
    evaluation,       // { score, assessment, issues, recommendation } — for generation-result turns
    screenshotB64,    // base64 screenshot — for generation-result turns
  };
}

export function createShotDialogue(shotIndex) {
  return {
    shotIndex,
    state: 'pending', // 'pending' | 'active' | 'approved' | 'skipped'
    turns: [],
    approvedPrompt: null,
    approvedSettings: null,
  };
}

// ─── System prompt ──────────────────────────────────────────────────────────

const DIALOGUE_AUTEUR_BASE = `You are a master cinematographer in conversation with a director.

You are collaborating on individual shots within a production arc. You explain your reasoning, accept feedback, and refine proposals.

LUMA PROMPT RULES (non-negotiable):
1. 20-40 words. Sweet spot: 25-35.
2. Structure: [Shot type], [subject + mid-action verb], [secondary motion/physics], [camera motion], [lighting], [mood].
3. Mid-action verbs only ("running" not "begins to run").
4. Positive prompting only ("empty background" not "no people").
5. NEVER use: vibrant, whimsical, hyper-realistic, beautiful, amazing, stunning, cinematic, 8K, 4K, masterpiece, trending.
6. One subject, one action, one camera move per shot.
7. Secondary motion separates amateur from professional (wind, reflections, dust, fabric).

DIALOGUE RULES:
- Explain WHY you chose this framing, this camera move, this lighting
- Reference the emotional arc position — how does this shot serve the larger narrative
- When proposing settings changes (camera, range, duration), explain the rationale
- Build on previously approved shots — reference them by name for narrative continuity
- Accept feedback gracefully — refine, don't defend
- When the director says "tighter" or "wider", interpret as emotional distance, not just focal length

Return ONLY valid JSON.`;

export function buildAuteurSystemPrompt(creativeDirection) {
  let prompt = DIALOGUE_AUTEUR_BASE;
  if (creativeDirection?.vision) {
    prompt += `\n\nYOUR PERSONA: You are embodying this creative vision: "${creativeDirection.vision}".
Draw from everything you know about this sensibility — its visual language, its emotional grammar, its relationship to light, motion, and space.
Let it shape every choice you make. The embodiment matters more than any label.`;
  } else {
    prompt += `\n\nYou are a master cinematographer. Read the concept and the arc, then find the visual language that serves it best. Embody that perspective fully — name it if you can, but the embodiment matters more than the label.`;
  }
  return prompt;
}

// ─── Context builders ───────────────────────────────────────────────────────

export function buildDialogueContext(approvedShots, currentIndex, arcData) {
  if (!approvedShots?.length) return '';
  const lines = approvedShots.map((s) => {
    const beat = arcData?.beats?.[s.shotIndex];
    const pos = beat ? `${((beat.position || 0) * 100).toFixed(0)}%` : '?';
    return `  Shot ${s.shotIndex + 1} "${s.name}" [${pos}]: ${s.prompt}${s.settings?.cameraControl ? ` | camera: ${s.settings.cameraControl}` : ''}`;
  });
  return `\nPREVIOUSLY APPROVED SHOTS (narrative so far):
${lines.join('\n')}

Shot ${currentIndex + 1} must continue this narrative thread.\n`;
}

function buildShotContext(shot, arcData) {
  const beat = arcData?.beats?.[shot.beatIndex ?? 0];
  const pos = beat ? ((beat.position || 0) * 100).toFixed(0) : '?';
  const labels = ['opening', 'tension', 'floor', 'pivot', 'resolution', 'terminal'];
  const p = beat?.position ?? 0;
  const pivotPos = arcData?.pivotPosition ?? 0.6;
  let label = 'opening';
  if (p <= 0.15) label = 'opening';
  else if (p <= 0.35) label = 'tension';
  else if (p < pivotPos - 0.05) label = 'floor';
  else if (Math.abs(p - pivotPos) <= 0.12) label = 'pivot';
  else if (p <= 0.85) label = 'resolution';
  else label = 'terminal';

  return {
    position: pos,
    label,
    feeling: beat?.feeling || '',
    description: beat?.description || '',
    change: beat?.change || '',
  };
}

// ─── API functions ──────────────────────────────────────────────────────────

/**
 * Generate the initial auteur proposal for a shot.
 */
export async function generateInitialProposal(shot, arcData, concept, creativeDirection, approvedShots, callApi) {
  const ctx = buildShotContext(shot, arcData);
  const dialogueCtx = buildDialogueContext(approvedShots, shot.beatIndex ?? 0, arcData);

  const userPrompt = `CONCEPT: "${concept}"
ARC SHAPE: ${arcData?.shape || '?'}
HANDLE: "${arcData?.handle || ''}"
PIVOT IMAGE: "${arcData?.pivotImage || ''}"
MOOD: ${creativeDirection?.mood || 'neutral'}
ENERGY: ${creativeDirection?.energy || 'building'}
${dialogueCtx}
CURRENT SHOT: "${shot.name}" — Shot ${(shot.beatIndex ?? 0) + 1}
ARC POSITION: ${ctx.position}% (${ctx.label.toUpperCase()})
FEELING: ${ctx.feeling}
DESCRIPTION: ${ctx.description}
CHANGE REQUIRED: ${ctx.change}
CURRENT PROMPT: "${shot.prompt}"

Propose your direction for this shot. Return JSON:
{
  "message": "Your explanation of why this framing serves the ${ctx.label} position (2-4 sentences)",
  "prompt": "Your proposed 20-40 word Luma prompt",
  "settings": {
    "cameraControl": "camera movement id or null",
    "dynamicRange": "standard or hdr",
    "duration": "5s or 10s"
  }
}`;

  const systemPrompt = buildAuteurSystemPrompt(creativeDirection);
  const raw = await callApi(systemPrompt, userPrompt, 0.5);
  return normalizeProposal(raw);
}

/**
 * Respond to human feedback with a refined proposal.
 */
export async function respondToFeedback(dialogue, feedback, arcData, concept, creativeDirection, approvedShots, callApi) {
  const shot = { name: '', beatIndex: dialogue.shotIndex, prompt: '' };
  // Reconstruct from dialogue turns
  const lastProposal = [...dialogue.turns].reverse().find((t) => t.role === 'auteur' && t.prompt);
  if (lastProposal) {
    shot.prompt = lastProposal.prompt;
    shot.name = dialogue.turns[0]?.message?.match(/"([^"]+)"/)?.[1] || `Shot ${dialogue.shotIndex + 1}`;
  }

  const ctx = buildShotContext(shot, arcData);
  const dialogueCtx = buildDialogueContext(approvedShots, dialogue.shotIndex, arcData);

  const conversationHistory = dialogue.turns.map((t) => {
    if (t.role === 'auteur') {
      return `AUTEUR: ${t.message}${t.prompt ? `\nPROMPT: "${t.prompt}"` : ''}`;
    }
    return `DIRECTOR: ${t.message}`;
  }).join('\n\n');

  const userPrompt = `CONCEPT: "${concept}"
ARC: ${arcData?.shape || '?'} — POSITION: ${ctx.position}% (${ctx.label.toUpperCase()})
${dialogueCtx}
CONVERSATION SO FAR:
${conversationHistory}

DIRECTOR: ${feedback}

Refine your proposal based on this feedback. Return JSON:
{
  "message": "Your response acknowledging the feedback and explaining your refinement (2-3 sentences)",
  "prompt": "Your refined 20-40 word Luma prompt",
  "settings": {
    "cameraControl": "camera movement id or null",
    "dynamicRange": "standard or hdr",
    "duration": "5s or 10s"
  }
}`;

  const systemPrompt = buildAuteurSystemPrompt(creativeDirection);
  const raw = await callApi(systemPrompt, userPrompt, 0.5);
  return normalizeProposal(raw);
}

/**
 * Generate 3 alternative directions for a shot.
 */
export async function requestAlternatives(dialogue, arcData, concept, creativeDirection, approvedShots, callApi) {
  const ctx = buildShotContext({ beatIndex: dialogue.shotIndex }, arcData);
  const dialogueCtx = buildDialogueContext(approvedShots, dialogue.shotIndex, arcData);

  const lastProposal = [...dialogue.turns].reverse().find((t) => t.role === 'auteur' && t.prompt);

  const userPrompt = `CONCEPT: "${concept}"
ARC: ${arcData?.shape || '?'} — POSITION: ${ctx.position}% (${ctx.label.toUpperCase()})
CHANGE: ${ctx.change}
${dialogueCtx}
CURRENT PROPOSAL: "${lastProposal?.prompt || 'none'}"

Generate 3 distinctly different approaches for this ${ctx.label} shot. Each should serve the arc position but through a different visual strategy.

Return JSON:
{
  "message": "Brief intro to the alternatives (1 sentence)",
  "alternatives": [
    {
      "theme": "short name",
      "direction": "one sentence explaining the approach",
      "prompt": "20-40 word Luma prompt",
      "settings": { "cameraControl": "...", "dynamicRange": "standard or hdr" }
    }
  ]
}`;

  const systemPrompt = buildAuteurSystemPrompt(creativeDirection);
  const raw = await callApi(systemPrompt, userPrompt, 0.7);
  return normalizeAlternatives(raw);
}

// ─── Response normalizers ───────────────────────────────────────────────────

function normalizeProposal(raw) {
  const d = typeof raw === 'object' ? raw : {};
  return {
    message: d.message || 'Here is my proposal for this shot.',
    prompt: d.prompt || '',
    settings: {
      cameraControl: d.settings?.cameraControl || null,
      dynamicRange: d.settings?.dynamicRange || 'standard',
      duration: d.settings?.duration || '5s',
    },
  };
}

function normalizeAlternatives(raw) {
  const d = typeof raw === 'object' ? raw : {};
  const alts = Array.isArray(d.alternatives) ? d.alternatives : [];
  return {
    message: d.message || 'Here are three alternative approaches.',
    alternatives: alts.map((a) => ({
      theme: a.theme || 'Alternative',
      direction: a.direction || '',
      prompt: a.prompt || '',
      settings: {
        cameraControl: a.settings?.cameraControl || null,
        dynamicRange: a.settings?.dynamicRange || 'standard',
      },
    })),
  };
}
