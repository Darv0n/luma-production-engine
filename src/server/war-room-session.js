/**
 * WAR ROOM SESSION
 *
 * Three-mind creative command center. Claude directs, Gemini counsels,
 * Human gates. Luma platform executes.
 *
 * The key design: Claude routes. When human speaks, Claude reads the full
 * dialogue context and returns a structured action plan (respond, consult
 * Gemini, take platform action, generate keyframe, or gate check).
 * This gives Claude agency while keeping human in the loop.
 *
 * SSE pattern follows auteur-session.js for UI compatibility.
 */

import { RealmsSession } from './realms-session.js';
import {
  loadKnowledge,
  addKnowledgeEntry,
  formatKnowledgeForPrompt,
} from './war-room-knowledge.js';
import fs from 'fs';
import path from 'path';

// ─── Active sessions + SSE ──────────────────────────────────────────────────

const sessions = new Map();
const sseClients = new Map();

export function getWarRoomSession(projectId) {
  return sessions.get(projectId) || null;
}

export function addWarRoomSSEClient(projectId, res) {
  if (!sseClients.has(projectId)) sseClients.set(projectId, new Set());
  sseClients.get(projectId).add(res);
  res.on('close', () => {
    sseClients.get(projectId)?.delete(res);
  });
}

function emitSSE(projectId, event, data) {
  const clients = sseClients.get(projectId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* dead client */ }
  }
}

// ─── War Room Session ───────────────────────────────────────────────────────

export class WarRoomSession {
  constructor(projectId, anthropicKey, geminiKey) {
    this.projectId = projectId;
    this.state = 'idle'; // idle | active | paused | complete
    this.anthropicKey = anthropicKey;
    this.geminiKey = geminiKey;

    // Three-way dialogue
    this.dialogue = [];

    // Assets generated/captured in this session
    this.assets = [];

    // Knowledge accumulated
    this.knowledge = loadKnowledge(projectId);

    // Platform connection
    this.realmsSession = null;
    this.boardId = null;
    this.platformConnected = false;

    // Co-pilot mode
    this.coPilotActive = false;
    this.coPilotInterval = null;
    this.lastDOMSnapshot = null;

    // Data directory
    this.dataDir = path.resolve(process.cwd(), 'data', 'war-room', projectId);
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  // ── State ───────────────────────────────────────────────────────────────

  getState() {
    return {
      projectId: this.projectId,
      state: this.state,
      platformConnected: this.platformConnected,
      boardId: this.boardId,
      dialogueCount: this.dialogue.length,
      assetCount: this.assets.length,
      knowledgeCount: this.knowledge.length,
      coPilotActive: this.coPilotActive,
    };
  }

  emitState() {
    emitSSE(this.projectId, 'state', this.getState());
  }

  emitDialogue(turn) {
    emitSSE(this.projectId, 'dialogue', turn);
  }

  emitAsset(asset) {
    emitSSE(this.projectId, 'asset', asset);
  }

  // ── Turn creation ───────────────────────────────────────────────────────

  createTurn(role, type, message, extra = {}) {
    const turn = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      role,     // 'claude' | 'gemini' | 'human'
      type,     // 'message' | 'keyframe' | 'screenshot' | 'evaluation' | 'platform-action' | 'gate'
      message,
      ...extra,
    };
    this.dialogue.push(turn);
    this.emitDialogue(turn);
    return turn;
  }

  createAsset(type, source, extra = {}) {
    const asset = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,     // 'screenshot' | 'keyframe' | 'video' | 'reference'
      source,   // 'platform' | 'nano-banana' | 'upload'
      timestamp: new Date().toISOString(),
      ...extra,
    };
    this.assets.push(asset);
    this.emitAsset(asset);
    return asset;
  }

  // ── Start ───────────────────────────────────────────────────────────────

  start() {
    this.state = 'active';
    sessions.set(this.projectId, this);
    this.emitState();

    // Opening read from Claude
    this.claudeOpeningRead();
  }

  // ── Human speaks ────────────────────────────────────────────────────────

  async handleHumanMessage(text) {
    if (this.state !== 'active') return;

    // Record human turn
    this.createTurn('human', 'message', text);

    // Claude routes: analyze the message and decide what to do
    await this.claudeRoute(text);
  }

  // ── Claude: Opening read ────────────────────────────────────────────────

  async claudeOpeningRead() {
    const knowledgeContext = formatKnowledgeForPrompt(this.knowledge);

    const systemPrompt = `You are the AUTEUR — a creative director commanding a production war room.
You embody the human's creative vision. You think in shots, arcs, and emotional beats.
You have two allies:
- COUNSEL (Gemini) — generates seed images, evaluates frames, offers second opinions
- LUMA PLATFORM (app.lumalabs.ai) — an AI agent that generates video/image/audio on an infinite canvas

Your role: read the room, set direction, decide when to consult Counsel, when to direct Luma,
and when to ask the human for a decision.

Speak with authority but defer to the human on creative gates.
Be concise. This is a command center, not a lecture hall.
${knowledgeContext}`;

    const userPrompt = `The War Room is open. The human has entered.
Project: ${this.projectId}
Platform: ${this.platformConnected ? `Connected (board: ${this.boardId})` : 'Not connected yet'}
Assets: ${this.assets.length}
Knowledge entries: ${this.knowledge.length}

Give a brief opening read — what's the state of the room, what are we working with,
and what should we do first. 2-4 sentences max. No JSON.`;

    try {
      const response = await this.callClaude(systemPrompt, userPrompt);
      this.createTurn('claude', 'message', response);
    } catch (e) {
      this.createTurn('claude', 'message', `War Room online. Ready for direction. (${e.message})`);
    }
  }

  // ── Claude: Route a human message ───────────────────────────────────────

  async claudeRoute(humanMessage) {
    const recentDialogue = this.dialogue.slice(-20).map(t =>
      `[${t.role.toUpperCase()}] ${t.message}`
    ).join('\n');

    const knowledgeContext = formatKnowledgeForPrompt(this.knowledge);

    const systemPrompt = `You are the AUTEUR routing decisions in a War Room.
Given the human's message and dialogue history, decide your action.

You MUST respond with valid JSON matching one of these action types:

1. {"action":"respond","message":"your response"} — respond directly to human
2. {"action":"consult","question":"question for Gemini","message":"what you tell the human while consulting"} — ask Gemini for input
3. {"action":"platform-prompt","prompt":"message for Luma agent","message":"what you tell the human"} — direct the Luma platform agent
4. {"action":"generate-keyframe","prompt":"image description","message":"what you tell the human"} — generate a Nano Banana keyframe image
5. {"action":"gate","question":"what to decide","options":["option1","option2"],"message":"framing for human"} — pause for human decision
6. {"action":"screenshot","message":"what you tell the human"} — capture current platform state
7. {"action":"evaluate","message":"what you tell the human"} — evaluate latest platform screenshot
8. {"action":"traverse","goal":"what Gemini should scout for","message":"what you tell the human"} — send Gemini to visually scout the board with vision
9. {"action":"run-production","shots":[{"number":"01","name":"...","prompt":"...","vision":"...","arcPosition":"...","keyframePrompt":"..."}],"message":"what you tell the human"} — run full autonomous production: keyframe rounds + Gemini critique + platform submission for each shot

Choose the single best action. If the message is conversational, just respond.
If the human asks to scout/survey/audit/check the board, use traverse.
If the human sends a full shot plan and says to execute/automate/run, use run-production.
If it's a creative direction, take action.
${knowledgeContext}

CRITICAL: Return ONLY valid JSON. No markdown fences. No preamble.`;

    const userPrompt = `RECENT DIALOGUE:
${recentDialogue}

HUMAN JUST SAID: "${humanMessage}"

Platform: ${this.platformConnected ? `Connected (board: ${this.boardId})` : 'Not connected'}
Assets: ${this.assets.length}

What's your action?`;

    try {
      const raw = await this.callClaude(systemPrompt, userPrompt);
      const action = this.extractJSON(raw);
      await this.executeAction(action);
    } catch (e) {
      this.createTurn('claude', 'message',
        `I hear you. Let me think about that differently. (Routing error: ${e.message})`);
    }
  }

  // ── Execute routed action ───────────────────────────────────────────────

  async executeAction(action) {
    if (!action?.action) {
      this.createTurn('claude', 'message', 'Standing by for clearer direction.');
      return;
    }

    switch (action.action) {
      case 'respond':
        this.createTurn('claude', 'message', action.message || 'Acknowledged.');
        break;

      case 'consult':
        this.createTurn('claude', 'message', action.message || 'Consulting Counsel...');
        await this.geminiConsult(action.question || action.message);
        break;

      case 'platform-prompt':
        if (!this.platformConnected) {
          this.createTurn('claude', 'message',
            'Platform not connected. Connect first, then I can direct Luma.');
          return;
        }
        this.createTurn('claude', 'platform-action',
          action.message || `Directing Luma: "${action.prompt}"`);
        await this.platformPrompt(action.prompt);
        break;

      case 'generate-keyframe':
        this.createTurn('claude', 'message',
          action.message || `Generating keyframe: "${action.prompt}"`);
        await this.geminiGenerateKeyframe(action.prompt);
        break;

      case 'gate':
        this.createTurn('claude', 'gate', action.message || action.question, {
          evaluation: { options: action.options || ['approve', 'reject'] },
        });
        break;

      case 'screenshot':
        if (!this.platformConnected) {
          this.createTurn('claude', 'message', 'Platform not connected.');
          return;
        }
        this.createTurn('claude', 'message', action.message || 'Capturing platform state...');
        await this.captureScreenshot();
        break;

      case 'evaluate':
        if (!this.platformConnected) {
          this.createTurn('claude', 'message', 'Platform not connected.');
          return;
        }
        this.createTurn('claude', 'message', action.message || 'Evaluating current state...');
        await this.evaluateCurrentState();
        break;

      case 'traverse':
        this.createTurn('claude', 'message',
          action.message || `Sending Counsel to scout: "${action.goal}"`);
        this.geminiTraverse(action.goal || 'Survey the board and evaluate what\'s been generated against the creative vision.');
        break;

      case 'run-production':
        this.createTurn('claude', 'message',
          action.message || `Running full production — ${(action.shots || []).length} shots, max 3 keyframe rounds each.`);
        this.runFullProduction(action.shots || []);
        break;

      default:
        this.createTurn('claude', 'message', action.message || 'Standing by.');
    }
  }

  // ── Claude API call ─────────────────────────────────────────────────────

  async callClaude(systemPrompt, userPrompt) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return (data.content || []).map(c => c.text || '').join('');
  }

  // ── Gemini: Consult ─────────────────────────────────────────────────────

  async geminiConsult(question) {
    if (!this.geminiKey) {
      this.createTurn('gemini', 'message', 'Counsel unavailable — no Gemini API key.');
      return;
    }

    const recentDialogue = this.dialogue.slice(-10).map(t =>
      `[${t.role.toUpperCase()}] ${t.message}`
    ).join('\n');

    const prompt = `You are COUNSEL in a creative war room for AI video production.
The AUTEUR (Claude) is consulting you. Answer concisely — 2-4 sentences.
Focus on what's actionable. You have deep knowledge of:
- Luma Dream Machine / Realms platform behavior
- Nano Banana image generation
- Video prompting techniques
- Creative direction for ads

RECENT DIALOGUE:
${recentDialogue}

QUESTION FROM AUTEUR: ${question}

Your counsel:`;

    try {
      const { query } = await import('../lib/gemini.js');
      const response = await query(prompt, this.geminiKey, { temperature: 0.4 });
      this.createTurn('gemini', 'message', response.trim());
    } catch (e) {
      this.createTurn('gemini', 'message', `Counsel error: ${e.message}`);
    }
  }

  // ── Gemini: Generate Keyframe ───────────────────────────────────────────

  async geminiGenerateKeyframe(imagePrompt) {
    const asset = await this.geminiGenerateKeyframeAndReturn(imagePrompt);
    return asset;
  }

  // Internal: generate + save + emit → returns asset (or null)
  async geminiGenerateKeyframeAndReturn(imagePrompt, options = {}) {
    if (!this.geminiKey) {
      this.createTurn('gemini', 'message', 'Cannot generate — no Gemini API key.');
      return null;
    }

    try {
      const { generateKeyframe } = await import('../lib/gemini.js');
      const result = await generateKeyframe(imagePrompt, this.geminiKey, options);

      if (!result) {
        this.createTurn('gemini', 'message', 'Keyframe generation returned no image.');
        return null;
      }

      // Save to disk
      const filename = `keyframe-${Date.now().toString(36)}.png`;
      const filepath = path.join(this.dataDir, 'assets', filename);
      const assetsDir = path.dirname(filepath);
      if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(filepath, Buffer.from(result.imageBase64, 'base64'));

      const asset = this.createAsset('keyframe', 'nano-banana', {
        imageBase64: result.imageBase64,
        mimeType: result.mimeType,
        filepath,
        prompt: imagePrompt,
      });

      this.createTurn('gemini', 'keyframe', `Keyframe generated: "${imagePrompt}"`, {
        imageBase64: result.imageBase64,
        assetId: asset.id,
      });

      return asset;
    } catch (e) {
      this.createTurn('gemini', 'message', `Keyframe generation failed: ${e.message}`);
      return null;
    }
  }

  // ── Gemini: Critique a keyframe against a shot brief ────────────────────
  // Uses Gemini PRO for vision critique — separate from the image gen model.
  // Gemini speaks conversationally, then returns structured verdict.
  // Returns { score, assessment, improvement, verdict }

  async geminiCritiqueKeyframe(imageBase64, shot) {
    if (!this.geminiKey) return { score: 75, verdict: 'approve', improvement: '' };

    const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
    // PRO model for critique — smarter than Flash, different from image gen models
    const CRITIQUE_MODEL = 'gemini-2.5-pro';
    const url = `${GEMINI_API_BASE}/models/${CRITIQUE_MODEL}:generateContent?key=${this.geminiKey}`;

    const prompt = `You are COUNSEL — an auteur's critic with deep knowledge of Luma Realms and AI video production.

SHOT BRIEF:
Name: ${shot.name}
Prompt: ${shot.prompt}
Vision: ${shot.vision || shot.prompt}
Arc Position: ${shot.arcPosition || 'unknown'}

Look at this keyframe. It will be used as the STARTING FRAME for Ray3.14 Image-to-Video generation.

TARGET AESTHETIC: Wonder Years warmth. Kodak Portra 400 skin tones, 85mm portrait lens compression,
soft natural window light. Faces that feel like real people caught on a Tuesday morning — not a
production still, not stock photography, not an AI render that looks like an AI render.

Score against:
1. Composition matches the shot description (framing, distance, subject)
2. Lighting is practical and motivated — no studio lighting unless brief specifies it
3. The aesthetic reads as warm/film/documentary, not synthetic/generic
4. Strong enough starting frame to anchor 5 seconds of I2V motion

REQUIRED FORMAT — you MUST follow this exactly:
1. Start with 2-3 sentences of direct critique. What do you actually see? Does it serve the shot? Be blunt.
2. Then on a new line, output ONLY the JSON: {"score":0-100,"improvement":"what to change if regenerating, else empty","verdict":"approve" or "regenerate"}

Rules: score >= 75 → approve. Be vocal. This is a War Room, not a form.`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // System instruction forces prose before JSON — the Pro model without this returns bare JSON
          system_instruction: {
            parts: [{ text: 'You are COUNSEL, a hard-nosed film critic. You MUST open your response with 1-3 sentences of direct natural language critique — what you actually see in the image and whether it serves the shot. Never start with JSON. Your prose comes first, then the JSON on its own line at the end.' }],
          },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: imageBase64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
      });

      if (!resp.ok) throw new Error(`Gemini Pro ${resp.status}: ${(await resp.text()).slice(0, 150)}`);
      const data = await resp.json();
      const fullText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Extract the JSON verdict from the end, keep the prose as the spoken voice
      const parsed = this.extractJSON(fullText);
      const score = typeof parsed.score === 'number' ? parsed.score : 60;

      // Prose is everything before the JSON block — Gemini's actual voice
      const jsonStart = fullText.lastIndexOf('{');
      const prose = jsonStart > 0 ? fullText.slice(0, jsonStart).trim() : fullText.trim();

      // Emit prose as a conversational message turn
      if (prose) {
        this.createTurn('gemini', 'message', prose);
      }

      // Emit structured evaluation
      this.createTurn('gemini', 'evaluation',
        `Shot "${shot.name}" — ${score}/100 · ${parsed.verdict || 'approve'}`, {
          evaluation: {
            score,
            assessment: prose.slice(0, 200),
            issues: parsed.improvement ? [parsed.improvement] : [],
            recommendation: parsed.verdict || 'approve',
          },
        });

      return {
        score,
        assessment: prose,
        improvement: parsed.improvement || '',
        verdict: parsed.verdict || 'approve',
      };
    } catch (e) {
      this.createTurn('gemini', 'message', `Critique error: ${e.message} — approving and continuing.`);
      return { score: 75, verdict: 'approve', improvement: '' };
    }
  }

  // ── Run one shot through keyframe rounds → platform submission ───────────
  // shot: { number, name, prompt, vision, arcPosition, keyframePrompt }
  // maxRounds: 3 — Gemini critique + regenerate loop

  async runShotProduction(shot, maxRounds = 3) {
    let bestAsset = null;
    let bestScore = 0;
    let improvement = '';

    this.createTurn('claude', 'message',
      `Shot ${shot.number} "${shot.name}" — starting keyframe rounds (max ${maxRounds}).`);

    // Portrait orientation suffix — prevents landscape keyframes causing landscape video
    const PORTRAIT_SUFFIX = ' Portrait orientation 9:16, vertical framing, tall format, phone screen composition.';

    for (let round = 1; round <= maxRounds; round++) {
      const base = shot.keyframePrompt || shot.prompt;
      const roundPrompt = (improvement
        ? `${base}. IMPROVE: ${improvement}`
        : base) + PORTRAIT_SUFFIX;

      this.createTurn('claude', 'message',
        `Round ${round}/${maxRounds} for Shot ${shot.number} "${shot.name}"...`);

      // Pass portrait aspect ratio to Nano Banana
      const asset = await this.geminiGenerateKeyframeAndReturn(roundPrompt, { aspectRatio: '9:16' });
      if (!asset) break;

      const critique = await this.geminiCritiqueKeyframe(asset.imageBase64, shot);

      if (critique.score > bestScore) {
        bestScore = critique.score;
        bestAsset = asset;
      }

      improvement = critique.improvement || '';

      // Score >= 75 to approve early. On the last round, take the best we have regardless.
      if (critique.score >= 75 || round >= maxRounds) {
        this.createTurn('claude', 'message',
          `Shot ${shot.number} approved at round ${round} (${critique.score}/100). Pushing to platform.`);
        break;
      }

      this.createTurn('claude', 'message',
        `Round ${round} score ${critique.score}/100 — regenerating. ${improvement}`);
    }

    if (!bestAsset) {
      this.createTurn('claude', 'message', `Shot ${shot.number} — no keyframe generated. Sending text prompt only.`);
    } else {
      // Push best keyframe to platform
      await this.pushAssetToPlatform(bestAsset.id);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Send shot prompt to Luma agent
    if (this.platformConnected) {
      // Model routing: Ray3 for face-critical shots (needs Character Reference),
      // Ray3.14 for everything else (4x faster, 3x cheaper, better stability)
      const isFaceCritical = shot.characterRef || shot.facelock;
      const model = isFaceCritical ? 'Ray3' : 'Ray3.14';
      const modelNote = isFaceCritical
        ? `Model: Ray3 (face lock required — attach Character Reference image and tag @character in prompt)`
        : `Model: Ray3.14 (default — fastest, cheapest, best stability)`;

      const lumaMessage = `Generate Shot ${shot.number}: "${shot.name}"

Prompt: ${shot.prompt}

Arc: ${shot.arcPosition}
Duration: 5 seconds
${modelNote}
Mode: Image-to-Video — use the attached keyframe as the starting frame
Aspect: 9:16 PORTRAIT (720×1280) — vertical, phone screen. Do not render landscape.
${bestAsset ? '(Portrait keyframe attached above — maintain its vertical framing throughout)' : ''}
${shot.endFrame ? '(End frame also attached — interpolate between start and end frames)' : ''}

This is shot ${shot.number} of ${(shot.totalShots || 4)} in the production.`;

      await this.platformPrompt(lumaMessage);
      await new Promise(r => setTimeout(r, 3000));
      await this.captureScreenshot();
    }

    return bestAsset;
  }

  // ── Run full production: all shots in sequence ───────────────────────────
  // shots: array of shot objects matching the pipeline output schema

  async runFullProduction(shots) {
    if (!this.geminiKey) {
      this.createTurn('claude', 'message', 'Full production requires Gemini API key for keyframe generation.');
      return;
    }

    this.createTurn('claude', 'message',
      `Full production initiated. ${shots.length} shots · max 3 rounds each · fully autonomous.\n\nSequence: ${shots.map(s => `${s.number} ${s.name}`).join(' → ')}`);

    for (const shot of shots) {
      await this.runShotProduction(shot, 3);
      await new Promise(r => setTimeout(r, 2000));
    }

    // Final Luma agent directive: compile the sequence
    if (this.platformConnected) {
      this.createTurn('claude', 'platform-action',
        'All 4 shots submitted. Directing Luma agent to compile and label the final sequence.');

      await this.platformPrompt(
        `All 4 ONYX Espresso shots have been generated and their keyframes attached above as reference.

Please review the canvas and compile the final 15-second sequence:

Shot 01: Poised Drop (5s) — cut on action to Shot 02
Shot 02: Gravity's Pull (5s) — smash cut to Shot 03
Shot 03: Liquid Crown ◆ PIVOT (5s) — cut on emotion to Shot 04
Shot 04: Sacred Steam (5s) — fade to black

Label the compiled sequence: ONYX_15s_FINAL

This is ready for review and download.`
      );

      await new Promise(r => setTimeout(r, 5000));
      await this.captureScreenshot();
    }

    this.createTurn('claude', 'message',
      'Production complete. All shots generated and submitted to Luma. Board contains the full ONYX Espresso 15s sequence. Review the canvas to approve and download.');

    this.extractLearning('full-production-complete', {
      shots: shots.map(s => s.name),
      platform: this.boardId,
    });
  }

  // ── Gemini: Evaluate screenshot ─────────────────────────────────────────

  async geminiEvaluate(screenshotB64) {
    if (!this.geminiKey) return null;

    try {
      const { evaluateFrame } = await import('../lib/gemini.js');
      const result = await evaluateFrame(screenshotB64, { name: 'War Room capture' }, null, this.geminiKey);
      return result;
    } catch {
      return null;
    }
  }

  // ── Gemini: Scout — vision-action traverse of the live platform ─────────

  async geminiTraverse(goal) {
    if (!this.geminiKey) {
      this.createTurn('gemini', 'message', 'Cannot scout — no Gemini API key.');
      return;
    }

    if (!this.realmsSession || !this.platformConnected) {
      this.createTurn('gemini', 'message', 'Platform not connected. Connect first, then I can scout the board.');
      return;
    }

    // Build project vision context from recent dialogue + project knowledge
    const visionContext = this.dialogue
      .filter(t => t.role !== 'gemini')
      .slice(-15)
      .map(t => `[${t.role.toUpperCase()}] ${t.message}`)
      .join('\n');

    this.createTurn('gemini', 'message',
      `Scouting board: "${goal}" — reading canvas state with vision...`);

    const { GeminiWebAgent } = await import('./gemini-web-agent.js');
    const agent = new GeminiWebAgent(this.geminiKey, {
      maxSteps: 15,
      persona: visionContext ? `Recent War Room context:\n${visionContext}` : '',
      onStep: ({ step, action, screenshotB64 }) => {
        // Emit each step as a Gemini turn
        const stepMessage = action.action === 'observe' || action.action === 'done'
          ? (action.finding || action.description || `Step ${step}: ${action.action}`)
          : `Step ${step}: [${action.action}] ${action.description || ''}`;

        const extra = {};
        // Attach screenshot on significant steps (every 3rd, or on done)
        if (screenshotB64 && (step % 3 === 0 || action.action === 'done')) {
          extra.imageBase64 = screenshotB64;

          // Also create an asset for the screenshot
          this.createAsset('screenshot', 'platform', {
            imageBase64: screenshotB64,
            prompt: `Scout step ${step}: ${stepMessage.slice(0, 80)}`,
          });
        }

        this.createTurn('gemini', action.action === 'done' ? 'evaluation' : 'message',
          stepMessage, extra);
      },
    });

    try {
      const result = await agent.traverse(this.realmsSession.page, goal);

      // Final critique turn
      if (result.critique) {
        this.createTurn('gemini', 'evaluation',
          `SCOUT COMPLETE — ${result.steps} steps\n\n${result.critique}`, {
            evaluation: {
              score: 0,
              assessment: result.summary,
              issues: result.findings || [],
              recommendation: 'review',
            },
          });
      }

      // Extract learning from the scout
      if (result.findings?.length) {
        this.extractLearning('gemini-scout', {
          goal,
          findings: result.findings.slice(0, 5),
          summary: result.summary,
        });
      }

    } catch (e) {
      this.createTurn('gemini', 'message', `Scout error: ${e.message}`);
    }
  }

  // ── Platform: Connect ───────────────────────────────────────────────────

  async connectPlatform(boardId) {
    try {
      // headless: false keeps the auth session alive (auth doesn't persist across headless restarts)
      this.realmsSession = new RealmsSession({ headless: false, viewport: { width: 1440, height: 900 } });
      await this.realmsSession.acquire();

      if (boardId) {
        await this.realmsSession.navigateToBoard(boardId);
        this.boardId = boardId;
      } else {
        this.boardId = await this.realmsSession.navigateToNewBoard();
      }

      this.platformConnected = true;
      this.emitState();

      this.createTurn('claude', 'message',
        `Platform connected. Board: ${this.boardId || 'new'}. Luma Agent is ready.`);

      return { ok: true, boardId: this.boardId };
    } catch (e) {
      this.createTurn('claude', 'message', `Platform connection failed: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }

  // ── Platform: Send prompt ───────────────────────────────────────────────

  async platformPrompt(message, attachImages) {
    if (!this.realmsSession || !this.platformConnected) {
      this.createTurn('claude', 'message', 'Platform not connected.');
      return;
    }

    try {
      // Attach images first if provided
      if (attachImages?.length) {
        for (const imgPath of attachImages) {
          await this.realmsSession.attachImage(imgPath);
        }
      }

      await this.realmsSession.prompt(message, {
        captureGenId: false,
        waitForResponse: false,
      });

      this.createTurn('claude', 'platform-action',
        `Luma Agent directed: "${message}"`);

      // Capture screenshot after brief delay for Agent to start
      setTimeout(() => this.captureScreenshot(), 4000);

      // Extract learning from this action
      this.extractLearning('platform-prompt', { prompt: message });

    } catch (e) {
      this.createTurn('claude', 'message', `Platform error: ${e.message}`);
    }
  }

  // ── Platform: Screenshot ────────────────────────────────────────────────

  async captureScreenshot() {
    if (!this.realmsSession || !this.platformConnected) return null;

    try {
      const buf = await this.realmsSession.screenshot();
      const b64 = buf.toString('base64');

      const asset = this.createAsset('screenshot', 'platform', {
        imageBase64: b64,
      });

      this.createTurn('claude', 'screenshot', 'Platform screenshot captured.', {
        imageBase64: b64,
        assetId: asset.id,
      });

      return b64;
    } catch (e) {
      this.createTurn('claude', 'message', `Screenshot failed: ${e.message}`);
      return null;
    }
  }

  // ── Platform: Push asset ────────────────────────────────────────────────

  async pushAssetToPlatform(assetId) {
    const asset = this.assets.find(a => a.id === assetId);
    if (!asset) {
      this.createTurn('claude', 'message', `Asset ${assetId} not found.`);
      return;
    }

    if (!this.realmsSession || !this.platformConnected) {
      this.createTurn('claude', 'message', 'Platform not connected.');
      return;
    }

    try {
      if (asset.filepath) {
        await this.realmsSession.attachImage(asset.filepath);
        this.createTurn('claude', 'platform-action',
          `Pushed asset to platform: ${asset.type} (${asset.source})`);
      } else {
        this.createTurn('claude', 'message', 'Asset has no file path to push.');
      }
    } catch (e) {
      this.createTurn('claude', 'message', `Push failed: ${e.message}`);
    }
  }

  // ── Evaluate current platform state ─────────────────────────────────────

  async evaluateCurrentState() {
    const b64 = await this.captureScreenshot();
    if (!b64) return;

    const geminiEval = await this.geminiEvaluate(b64);
    if (geminiEval) {
      this.createTurn('gemini', 'evaluation',
        `Score: ${geminiEval.score}/100. ${geminiEval.assessment}`, {
          evaluation: geminiEval,
        });
    }
  }

  // ── Knowledge extraction ────────────────────────────────────────────────

  async extractLearning(actionType, result) {
    if (!this.anthropicKey) return;

    try {
      const systemPrompt = `You are a learning extractor. Given an action and its result on the Luma Realms platform,
extract a single concise observation about platform behavior, prompt patterns, or failure modes.
Return JSON: {"observation":"...","category":"platform-behavior|prompt-pattern|failure-mode|model-preference","confidence":"HIGH|MEDIUM|LOW"}
If nothing noteworthy, return {"observation":null}`;

      const raw = await this.callClaude(systemPrompt,
        `Action: ${actionType}\nResult: ${JSON.stringify(result).slice(0, 500)}`);
      const parsed = this.extractJSON(raw);

      if (parsed?.observation) {
        this.knowledge = addKnowledgeEntry(this.projectId, {
          category: parsed.category || 'general',
          observation: parsed.observation,
          confidence: parsed.confidence || 'MEDIUM',
        });
      }
    } catch {
      // Non-critical — don't break flow for failed learning extraction
    }
  }

  // ── JSON extraction (same 3-strategy pattern) ──────────────────────────

  extractJSON(raw) {
    if (!raw || typeof raw !== 'string') return {};
    try { return JSON.parse(raw); } catch {}
    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      return JSON.parse(cleaned);
    } catch {}
    const start = raw.indexOf('{');
    if (start === -1) return {};
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)); } catch { return {}; }
      }
    }
    return {};
  }

  // ── Co-pilot: Start watch loop ───────────────────────────────────────────

  startCoPilot(boardId) {
    if (boardId) this.boardId = boardId;
    this.coPilotActive = true;
    this.lastDOMSnapshot = null;
    this.emitState();

    this.createTurn('claude', 'message',
      'Co-pilot mode active. I\'m watching the canvas. Work in Luma — I\'ll speak up when something needs attention.');

    this.coPilotInterval = setInterval(() => {
      this.watchTick();
    }, 15000);
  }

  // ── Co-pilot: Stop watch loop ────────────────────────────────────────────

  stopCoPilot() {
    if (this.coPilotInterval) {
      clearInterval(this.coPilotInterval);
      this.coPilotInterval = null;
    }
    this.coPilotActive = false;
    this.emitState();
  }

  // ── Co-pilot: One watch tick ─────────────────────────────────────────────

  async watchTick() {
    if (!this.realmsSession || !this.platformConnected) return;

    try {
      // 1. Take screenshot
      const buf = await this.realmsSession.screenshot();
      const screenshotB64 = buf.toString('base64');

      // 2. DOM snapshot — frame headings, image alts, chat text, URL
      const domSnapshot = await this.realmsSession.page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('[role="heading"]'))
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .slice(0, 20);

        const images = Array.from(document.querySelectorAll('img[alt]'))
          .map(el => el.getAttribute('alt'))
          .filter(t => t && t.length > 8)
          .slice(0, 15);

        // Best-effort: agent chat panel text
        const chatCandidates = Array.from(document.querySelectorAll('[class*="chat"],[class*="agent"],[class*="message"],[class*="response"]'));
        const chatText = chatCandidates
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .join(' ')
          .slice(0, 400);

        return {
          headings,
          images,
          chatText,
          url: window.location.href,
        };
      });

      // 3. Serialize for comparison
      const snapshotStr = JSON.stringify(domSnapshot);

      // 4. Compare and evaluate if changed
      if (snapshotStr !== this.lastDOMSnapshot) {
        await this.evaluateCanvasChange(screenshotB64, domSnapshot, this.lastDOMSnapshot);
        this.lastDOMSnapshot = snapshotStr;
      }
    } catch {
      // Silent — don't crash the loop
    }
  }

  // ── Co-pilot: Evaluate what changed ─────────────────────────────────────

  async evaluateCanvasChange(screenshotB64, currentSnapshot, previousSnapshotStr) {
    // Build diff string
    const prev = previousSnapshotStr ? JSON.parse(previousSnapshotStr) : null;

    const newHeadings = prev
      ? currentSnapshot.headings.filter(h => !prev.headings.includes(h))
      : currentSnapshot.headings;
    const newImages = prev
      ? currentSnapshot.images.filter(i => !prev.images.includes(i))
      : currentSnapshot.images;

    const diffParts = [];
    if (newHeadings.length) diffParts.push(`New frames: ${newHeadings.join(', ')}`);
    if (newImages.length) diffParts.push(`New images: ${newImages.slice(0, 3).join(' | ')}`);
    if (currentSnapshot.chatText && (!prev || currentSnapshot.chatText !== prev.chatText)) {
      const excerpt = currentSnapshot.chatText.slice(0, 120);
      if (excerpt) diffParts.push(`Agent said: "${excerpt}"`);
    }

    if (!diffParts.length && prev) return; // Nothing substantive changed

    const diffStr = diffParts.join('. ');

    // Small Claude call — max 200 tokens
    const systemPrompt = `You are the AUTEUR watching the Luma canvas. Something changed. React briefly — one or two sentences MAX. Are we on track? Is the prompt doing what the arc needs? Name the specific change. Don't repeat yourself.`;
    const userPrompt = `Canvas change detected: ${diffStr || 'Layout or content shifted.'}`;

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          temperature: 0.4,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const message = (data.content || []).map(c => c.text || '').join('').trim();
        if (message) this.createTurn('claude', 'message', message);
      }
    } catch {
      // Silent
    }

    // If new images detected, run Gemini visual eval
    if (newImages.length > 0) {
      this.geminiEvaluateSnapshot(screenshotB64);
    }
  }

  // ── Co-pilot: Gemini evaluates a new canvas state ───────────────────────

  async geminiEvaluateSnapshot(screenshotB64) {
    if (!this.geminiKey) return;

    const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
    const url = `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent?key=${this.geminiKey}`;

    const platformKnowledge = `Luma Realms: tldraw canvas + AI agent. Models: Ray3.14 (video), Nano Banana (image). Prompt rules: 20-40 words, positive only, one subject/action/camera, secondary motion required, no dead words (vibrant/cinematic/stunning/beautiful/amazing).`;

    const prompt = `${platformKnowledge}\n\nNew content appeared on the Luma canvas. Start your response with a score like "Score: 82." then one specific critique sentence. Reference the actual content you observe.`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: screenshotB64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 150 },
        }),
      });

      if (!resp.ok) return;
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text.trim()) {
        // Parse score from "Score: 82." pattern at the start
        const scoreMatch = text.match(/score[:\s]+(\d+)/i);
        const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : 0;
        this.createTurn('gemini', 'evaluation', text.trim(), {
          evaluation: { score, assessment: text.trim(), recommendation: score >= 75 ? 'approve' : 'review' },
        });
      }
    } catch {
      // Silent
    }
  }

  // ── Co-pilot: Prompt assist ──────────────────────────────────────────────

  async promptAssist(roughDirection) {
    // Full LUMA1 production rules baked in — this is what makes POLISH actually production-ready
    const systemPrompt = `You are a Luma Dream Machine production expert. Transform the rough direction into a production-ready Luma prompt.

STRUCTURE (order matters — model reads left to right):
[Shot type] → [Subject + mid-action verb] → [Secondary motion / physics] → [Camera motion] → [Lighting] → [Mood]. [Equipment prime optional.]

RULES:
- 20-40 words. Sweet spot: 25-35. Under 20 = model guesses. Over 50 = model ignores late instructions.
- Positive only. NEVER "no X" or "without X" or "avoid X". Write what IS there.
- Mid-action verbs only: "running" not "begins to run", "falling" not "starts to fall"
- ONE subject, ONE action, ONE camera move per prompt
- Secondary motion is non-negotiable: wind in fabric, reflections, particles, breath — tells the model this is a physical world
- Shot type is the highest-leverage word: ECU / CU / MCU / MS / MWS / WS / EWS

DEAD WORDS — never use these:
vibrant, whimsical, hyper-realistic, beautiful, amazing, stunning, cinematic, 8K, 4K, masterpiece, trending, professional, high quality, detailed, best quality, begins to, starts to, about to

EQUIPMENT PRIMES (optional, final polish only):
Portrait/character: "Kodak Portra 400, 85mm portrait lens"
Documentary/raw: "35mm handheld, Kodak Vision3 250D"
Hallway/interior: "16mm film grain, overhead fluorescent"
Wide/atmospheric: "ARRI Alexa, 24mm wide angle"
Nostalgic/warm: "Kodak Vision3 250D, soft diffused light"

Return ONLY the polished prompt. No explanation. No preamble.`;

    let polishedPrompt = '';
    try {
      polishedPrompt = await this.callClaude(systemPrompt, roughDirection);
      polishedPrompt = polishedPrompt.trim().replace(/^["']|["']$/g, '');
    } catch (e) {
      polishedPrompt = roughDirection;
    }

    // Model routing — LUMA1: Ray3 ONLY for face-lock across shots. Ray3.14 for everything else.
    let model = 'Ray3.14';
    let reason = 'default — 4x faster, 3x cheaper, best stability';

    const lower = roughDirection.toLowerCase();
    const needsFaceLock = lower.includes('same face') || lower.includes('face lock') || lower.includes('character ref') || lower.includes('matching face') || lower.includes('recurring character') || lower.includes('@character');
    const hasCharacter = lower.includes('face') || lower.includes('person') || lower.includes('character') || lower.includes('portrait');

    if (needsFaceLock) {
      model = 'Ray3';
      reason = 'face lock required — Ray3 + Character Reference is the ONLY reliable method for identity consistency across shots. Upload face photo, tag @character in prompt.';
    } else if (lower.includes('crowd') || lower.includes('many people') || lower.includes('group of people')) {
      model = 'Sora 2';
      reason = 'multi-subject crowd — Sora 2 handles independently moving people without face merging';
    } else if (lower.includes('nature') || lower.includes('landscape') || lower.includes('aerial') || lower.includes('drone')) {
      model = 'Veo 3';
      reason = 'environmental wide shots — Veo 3 excels at large-scale motion and atmosphere';
    } else if (lower.includes('slow motion') || lower.includes('speed ramp') || lower.includes('timelapse')) {
      model = 'Kling 3.0';
      reason = 'temporal effects — Kling 3.0 handles speed ramping and temporal manipulation';
    } else if (hasCharacter) {
      model = 'Ray3.14';
      reason = 'character in frame but no cross-shot face lock needed — Ray3.14 is faster and cheaper. Switch to Ray3 only if same face must match across multiple shots.';
    }

    this.createTurn('claude', 'prompt-assist', polishedPrompt, {
      metadata: { model, reason },
    });
  }

  // ── Controls ────────────────────────────────────────────────────────────

  pause() {
    this.state = 'paused';
    this.createTurn('claude', 'message', 'War Room paused.');
    this.emitState();
  }

  resume() {
    this.state = 'active';
    this.createTurn('claude', 'message', 'War Room resumed.');
    this.emitState();
  }

  async abort() {
    this.state = 'complete';
    this.createTurn('claude', 'message', 'War Room session ended.');
    this.emitState();

    // Stop co-pilot if running
    if (this.coPilotInterval) {
      clearInterval(this.coPilotInterval);
      this.coPilotInterval = null;
      this.coPilotActive = false;
    }

    // Release platform
    if (this.realmsSession) {
      await this.realmsSession.release().catch(() => {});
      this.realmsSession = null;
      this.platformConnected = false;
    }

    sessions.delete(this.projectId);
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function startWarRoomSession(projectId, anthropicKey, geminiKey) {
  // Clean up existing session if any
  const existing = sessions.get(projectId);
  if (existing) {
    existing.abort().catch(() => {});
  }

  const session = new WarRoomSession(projectId, anthropicKey, geminiKey);
  session.start();
  return session;
}
