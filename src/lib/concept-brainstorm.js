/**
 * CONCEPT BRAINSTORM ENGINE
 *
 * Sprint 04B: Embodied Auteur Agent
 *
 * Pre-pipeline concept optimization through an embodied creative vision.
 * The auteur is NOT a fixed director from a list — it's whatever the human
 * describes in the vision field, fully embodied from the LLM's latent space.
 *
 * Functions:
 *   embodyAndPropose              — auteur reads concept, proposes Luma-optimized version
 *   respondToFeedback             — human steers, auteur refines
 *   interpretPlatformBrainstorm   — reads Luma platform brainstorm through embodied vision
 *   buildConceptSystemPrompt      — builds system prompt with vision embodiment
 */

import { callAPI } from './api.js';

// ─── System prompt ──────────────────────────────────────────────────────────

export function buildConceptSystemPrompt(creativeDirection) {
  let prompt = 'You are a creative director for a Luma Dream Machine project.\n\n';

  if (creativeDirection?.vision) {
    prompt += `The human's creative vision: "${creativeDirection.vision}". Embody this fully.\n`;
    prompt += 'Draw from everything you know about this sensibility — its visual language,\n';
    prompt += 'its emotional grammar, its relationship to light, motion, and space.\n';
    prompt += 'Let it shape every choice you make.\n\n';
  } else {
    prompt += 'Read the concept below. Find the visual language that serves it best.\n';
    prompt += 'Embody that perspective fully — name it if you can, but the embodiment\n';
    prompt += 'matters more than the label.\n\n';
  }

  prompt += 'LUMA OPTIMIZATION RULES:\n';
  prompt += '- Concrete visual language, not abstract descriptions\n';
  prompt += '- Physical specificity: materials, light sources, motion physics\n';
  prompt += '- One strong image per scene, not narrative summary\n';
  prompt += '- Think in shots, not paragraphs\n';
  prompt += '- 20-40 words per prompt, mid-action verbs, positive language only\n';
  prompt += '- "running" not "begins to run" — mid-action only\n';
  prompt += '- Never use: vibrant, whimsical, hyper-realistic, beautiful, stunning, cinematic, 8K, 4K, masterpiece\n\n';
  prompt += 'Return ONLY valid JSON.';

  return prompt;
}

// ─── Core functions ────────────────────────────────────────────────────────

/**
 * Auteur embodies vision, reads concept, proposes Luma-optimized version.
 *
 * @param {string} concept — raw user concept
 * @param {Object} creativeDirection — { vision, mood, energy }
 * @returns {Promise<{ message, refinedConcept, suggestions }>}
 */
export async function embodyAndPropose(concept, creativeDirection) {
  const systemPrompt = buildConceptSystemPrompt(creativeDirection);

  const userPrompt = [
    `CONCEPT: "${concept}"`,
    `MOOD: ${creativeDirection?.mood || 'neutral'}`,
    `ENERGY: ${creativeDirection?.energy || 'building'}`,
    '',
    'Read this concept. What is its emotional core? What visual language serves it?',
    'Shape it so Luma Dream Machine generates strong keyframes and video.',
    '',
    'Return JSON:',
    '{',
    '  "message": "your creative read (2-3 sentences, fully in character)",',
    '  "refinedConcept": "the optimized concept text — concrete, visual, physical",',
    '  "suggestions": { "mood": "...", "energy": "..." }',
    '}',
  ].join('\n');

  const raw = await callAPI(systemPrompt, userPrompt);
  return normalizeProposal(raw);
}

/**
 * Human steers, auteur refines while maintaining embodied perspective.
 *
 * @param {Array} turns — dialogue turns so far
 * @param {string} feedback — human's steering input
 * @param {Object} creativeDirection — { vision, mood, energy }
 * @returns {Promise<{ message, refinedConcept, suggestions }>}
 */
export async function respondToFeedback(turns, feedback, creativeDirection) {
  const systemPrompt = buildConceptSystemPrompt(creativeDirection);

  const conversationHistory = turns.map((t) => {
    if (t.role === 'auteur') {
      return `AUTEUR: ${t.message}${t.prompt ? `\nREFINED: "${t.prompt}"` : ''}`;
    }
    return `HUMAN: ${t.message}`;
  }).join('\n\n');

  const userPrompt = [
    'CONVERSATION SO FAR:',
    conversationHistory,
    '',
    `HUMAN: ${feedback}`,
    '',
    'Refine your proposal based on this feedback. Stay in character.',
    '',
    'Return JSON:',
    '{',
    '  "message": "your response acknowledging the feedback and explaining your refinement (2-3 sentences)",',
    '  "refinedConcept": "your refined concept text",',
    '  "suggestions": { "mood": "...", "energy": "..." }',
    '}',
  ].join('\n');

  const raw = await callAPI(systemPrompt, userPrompt);
  return normalizeProposal(raw);
}

/**
 * Reads raw Luma platform brainstorm results through the embodied vision.
 *
 * @param {Object} platformResults — { wsResults, domResults } from callPlatformBrainstorm
 * @param {string} concept — the optimized concept that was used
 * @param {Object} creativeDirection — { vision, mood, energy }
 * @returns {Promise<{ message, interpretations }>}
 */
export async function interpretPlatformBrainstorm(platformResults, concept, creativeDirection) {
  const systemPrompt = buildConceptSystemPrompt(creativeDirection);

  const platformData = JSON.stringify(platformResults, null, 2);

  const userPrompt = [
    `CONCEPT USED FOR DRAFT: "${concept}"`,
    '',
    'Luma Dream Machine\'s AI brainstorm returned these suggestions:',
    platformData,
    '',
    'Interpret these through your embodied creative vision.',
    'Which suggestions align with your perspective? Which push in interesting new directions?',
    'For each, propose a refined concept that integrates the suggestion.',
    '',
    'Return JSON:',
    '{',
    '  "message": "your interpretation of the platform suggestions (2-3 sentences, in character)",',
    '  "interpretations": [',
    '    { "theme": "short name", "refinedConcept": "concept text integrating this suggestion", "rationale": "why this works" }',
    '  ]',
    '}',
  ].join('\n');

  const raw = await callAPI(systemPrompt, userPrompt);
  return normalizeInterpretations(raw);
}

// ─── Response normalizers ───────────────────────────────────────────────────

function normalizeProposal(raw) {
  const d = typeof raw === 'object' ? raw : {};
  return {
    message: d.message || 'Here is my creative read of your concept.',
    refinedConcept: d.refinedConcept || '',
    suggestions: {
      mood: d.suggestions?.mood || null,
      energy: d.suggestions?.energy || null,
    },
  };
}

function normalizeInterpretations(raw) {
  const d = typeof raw === 'object' ? raw : {};
  const interps = Array.isArray(d.interpretations) ? d.interpretations : [];
  return {
    message: d.message || 'Here are my interpretations of the platform suggestions.',
    interpretations: interps.map((i) => ({
      theme: i.theme || 'Suggestion',
      refinedConcept: i.refinedConcept || '',
      rationale: i.rationale || '',
    })),
  };
}
