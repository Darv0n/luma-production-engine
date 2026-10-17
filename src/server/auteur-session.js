/**
 * AUTEUR SESSION
 *
 * Sprint 04 production state machine. Drives the full platform workflow:
 * THINK → DESIGN → GENERATE → CHAIN → POLISH → DELIVER
 *
 * Two modes:
 * - MANUAL: stops after DESIGN, exports platform operations brief
 * - AUTEUR: Playwright drives Dream Machine end-to-end
 *
 * Uses PlatformSession for browser reuse (one context per production run).
 * SSE events follow DreamMachineSession patterns for UI compatibility.
 */

import { PlatformSession } from './platform-session.js';
import { evaluateGeneration } from './dream-evaluator.js';
import {
  submitKeyframeGeneration,
  extendWithEndFrame,
  upscaleGeneration,
  addAudioOnPlatform,
  waitForGeneration,
  downloadLastFrame,
  downloadFile,
  createBoard,
} from './luma-platform.js';
import { assembleSequence } from './ffmpeg-assembly.js';
import { runPipeline } from '../lib/pipeline.js';
import path from 'path';
import fs from 'fs';

// ─── States ─────────────────────────────────────────────────────────────────

export const STATES = {
  IDLE:     'idle',
  THINK:    'think',
  DESIGN:   'design',
  GENERATE: 'generate',
  CHAIN:    'chain',
  POLISH:   'polish',
  DELIVER:  'deliver',
  COMPLETE: 'complete',
  ERROR:    'error',
  PAUSED:   'paused',
};

export const SUBSTATES = {
  // DESIGN
  DESIGN_GENERATING:   'design.generating',
  DESIGN_REVIEWING:    'design.reviewing',
  DESIGN_APPROVED:     'design.approved',
  // GENERATE
  GENERATE_SUBMITTING: 'generate.submitting',
  GENERATE_POLLING:    'generate.polling',
  GENERATE_EVALUATING: 'generate.evaluating',
  GENERATE_APPROVED:   'generate.approved',
  GENERATE_RETRY:      'generate.retry',
  // CHAIN
  CHAIN_EXTRACTING:    'chain.extracting',
  CHAIN_EXTENDING:     'chain.extending',
  CHAIN_EVALUATING:    'chain.evaluating',
  // POLISH
  POLISH_UPSCALING:    'polish.upscaling',
  POLISH_AUDIO:        'polish.audio',
  POLISH_REFRAME:      'polish.reframe',
};

// ─── Active sessions + SSE ──────────────────────────────────────────────────

const sessions = new Map();
const sseClients = new Map();

export function getAuteurSession(projectId) {
  return sessions.get(projectId) || null;
}

export function addAuteurSSEClient(projectId, res) {
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

// ─── Auteur Session ─────────────────────────────────────────────────────────

export class AuteurSession {
  constructor(projectId, runId, mode, settings, anthropicKey) {
    this.projectId = projectId;
    this.runId = runId;
    this.mode = mode;                    // 'manual' | 'auteur'
    this.state = STATES.IDLE;
    this.substate = null;

    // Pipeline outputs
    this.analysis = null;
    this.arcData = null;
    this.shotPlan = [];

    // Keyframe images per shot
    this.keyframes = {};                 // { [idx]: { startPath, endPath } }

    // Platform generation state per shot
    this.generations = {};               // { [idx]: { id, state, videoUrl, score, attempts } }

    // Chained generation state
    this.chainedIds = {};                // { [idx]: generationId }

    // Polish state
    this.polishStates = {};              // { [idx]: { upscaleId, audioId, reframeId } }

    // Platform session (Playwright browser)
    this.platformSession = null;
    this.boardId = null;

    // Check-in / SSE
    this.checkInQueue = [];
    this.pendingResponse = null;
    this.log = [];
    this.paused = false;
    this.aborted = false;
    this.creditsUsed = 0;

    // Settings
    this.settings = {
      autoApproveThreshold: settings?.autoApproveThreshold ?? 80,
      maxRetries: settings?.maxRetries ?? 3,
      draft: settings?.draft !== false,
      polishUpscale: settings?.polishUpscale !== false,
      polishAudio: settings?.polishAudio !== false,
      polishReframe: settings?.polishReframe || null, // null = skip, '9:16' etc.
      ...settings,
    };
    this.anthropicKey = anthropicKey;

    // Output directory
    this.outputDir = path.resolve(process.cwd(), 'data', 'productions', projectId);
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  // ── Logging ───────────────────────────────────────────────────────────────

  addLog(message, type = 'info') {
    const entry = { timestamp: new Date().toISOString(), message, type };
    this.log.push(entry);
    emitSSE(this.projectId, 'log', entry);
  }

  setState(state, substate = null) {
    this.state = state;
    this.substate = substate;
    this.emitState();
  }

  getState() {
    return {
      projectId: this.projectId,
      runId: this.runId,
      mode: this.mode,
      state: this.state,
      substate: this.substate,
      boardId: this.boardId,
      shotPlan: this.shotPlan.map(s => ({ name: s.name, prompt: s.prompt })),
      generations: this.generations,
      keyframes: Object.fromEntries(
        Object.entries(this.keyframes).map(([k, v]) => [k, { hasStart: !!v.startPath, hasEnd: !!v.endPath }])
      ),
      polishStates: this.polishStates,
      checkIn: this.checkInQueue.length > 0 ? this.checkInQueue[0] : null,
      paused: this.paused,
      creditsUsed: this.creditsUsed,
    };
  }

  emitState() {
    emitSSE(this.projectId, 'state', this.getState());
  }

  // ── Check-in ──────────────────────────────────────────────────────────────

  async checkIn(message, options = {}) {
    const checkInData = {
      id: Date.now().toString(36),
      message,
      options: options.choices || null,
      type: options.type || 'check-in',
      shotIndex: options.shotIndex ?? null,
      evaluation: options.evaluation || null,
      screenshotB64: options.screenshotB64 || null,
    };

    this.checkInQueue.push(checkInData);
    this.addLog(`CHECK-IN: ${message}`, 'check-in');
    this.emitState();

    return new Promise((resolve) => {
      this.pendingResponse = resolve;
    });
  }

  handleResponse(response) {
    this.checkInQueue.shift();
    if (this.pendingResponse) {
      const resolve = this.pendingResponse;
      this.pendingResponse = null;
      resolve(response);
    }
    this.addLog(`Human response: ${typeof response === 'string' ? response : JSON.stringify(response)}`, 'human');
    this.emitState();
  }

  // ── Abort guard ───────────────────────────────────────────────────────────

  guardAbort() {
    if (this.aborted) throw new Error('Session aborted');
  }

  async guardPause() {
    while (this.paused && !this.aborted) {
      await new Promise(r => setTimeout(r, 1000));
    }
    this.guardAbort();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN ENTRY POINT
  // ═══════════════════════════════════════════════════════════════════════════

  async run(project, run) {
    sessions.set(this.projectId, this);

    try {
      // ── THINK ─────────────────────────────────────────────────────────
      await this.phaseThink(project, run);

      // ── DESIGN ────────────────────────────────────────────────────────
      await this.phaseDesign(project, run);

      // MANUAL mode stops here
      if (this.mode === 'manual') {
        this.setState(STATES.COMPLETE);
        this.addLog('MANUAL mode complete. Shot plan + keyframes ready for platform.');
        await this.checkIn(
          'Shot plan and keyframes ready. Use the platform brief to produce on Dream Machine manually.',
          { type: 'complete' }
        );
        return;
      }

      // ── AUTEUR: Acquire browser ───────────────────────────────────────
      this.platformSession = new PlatformSession({ headless: true });
      await this.platformSession.acquire();

      try {
        // Create board
        this.addLog('Creating board on Dream Machine...');
        const boardResult = await createBoard(project.name || `production-${this.projectId}`);
        this.boardId = boardResult.boardId;
        this.addLog(`Board created: ${boardResult.url}`);

        // ── GENERATE ──────────────────────────────────────────────────
        await this.phaseGenerate();

        // ── CHAIN ─────────────────────────────────────────────────────
        await this.phaseChain();

        // ── POLISH ────────────────────────────────────────────────────
        await this.phasePolish();

        // ── DELIVER ───────────────────────────────────────────────────
        await this.phaseDeliver();

      } finally {
        // Always release browser
        if (this.platformSession) await this.platformSession.release();
        this.platformSession = null;
      }

      // ── COMPLETE ────────────────────────────────────────────────────
      this.setState(STATES.COMPLETE);
      this.addLog(`Production complete. ${this.creditsUsed} credits used.`);
      emitSSE(this.projectId, 'complete', {
        creditsUsed: this.creditsUsed,
        outputDir: this.outputDir,
      });

    } catch (e) {
      if (e.message === 'Session aborted') {
        this.setState(STATES.ERROR);
        this.addLog('Session aborted by user.', 'error');
      } else {
        this.setState(STATES.ERROR);
        this.addLog(`Fatal error: ${e.message}`, 'error');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: THINK — Run pipeline (SCAN → ARC → SHOTS → VALIDATE)
  // ═══════════════════════════════════════════════════════════════════════════

  async phaseThink(project, run) {
    this.setState(STATES.THINK);
    this.addLog('Starting pipeline: SCAN → ARC → SHOTS → VALIDATE');

    const concept = run.concept || project.concept || '';
    const format = run.format || '15s';
    const product = run.product || '';
    const duration = run.targetDuration || '15s';

    const result = await runPipeline(
      concept, format, product, duration,
      async (stage, data) => {
        if (data === null) {
          this.addLog(`Pipeline stage: ${stage}...`);
        } else {
          this.addLog(`Pipeline stage: ${stage} complete`);
        }
        emitSSE(this.projectId, 'pipeline', { stage, data });
      },
      {
        characters: project.characters || [],
        creativeDirection: project.settings?.creativeDirection || null,
      }
    );

    this.analysis = result.analysis;
    this.arcData = result.arcData;
    this.shotPlan = result.shots;

    // Initialize per-shot state
    for (let i = 0; i < this.shotPlan.length; i++) {
      this.generations[i] = { id: null, state: 'waiting', videoUrl: null, score: null, attempts: 0 };
      this.keyframes[i] = { startPath: null, endPath: null };
      this.polishStates[i] = { upscaleId: null, audioId: null, reframeId: null };
    }

    // Check-in: approve shot plan
    const shotList = this.shotPlan.map((s, i) =>
      `  ${i + 1}. "${s.name}" — ${s.prompt.slice(0, 80)}...`
    ).join('\n');

    await this.checkIn(
      `Pipeline complete. ${this.shotPlan.length} shots planned:\n${shotList}\n\nApprove shot plan?`,
      { type: 'check-in', choices: ['approve', 'abort'] }
    );

    this.guardAbort();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: DESIGN — Generate keyframe images (start + end per shot)
  // ═══════════════════════════════════════════════════════════════════════════

  async phaseDesign(project, run) {
    this.setState(STATES.DESIGN, SUBSTATES.DESIGN_GENERATING);
    this.addLog('Generating keyframe images for each shot...');

    for (let i = 0; i < this.shotPlan.length; i++) {
      await this.guardPause();

      const shot = this.shotPlan[i];
      this.addLog(`Designing keyframes for shot ${i + 1}: "${shot.name}"`);

      // Generate start frame prompt from shot context
      const startPrompt = buildKeyframePrompt(shot, this.arcData, 'start');
      const endPrompt = buildKeyframePrompt(shot, this.arcData, 'end');

      // Generate via Anthropic API (image description → Photon API would go here)
      // For now, store the prompts — keyframes can be uploaded manually or via Photon
      const startPath = path.join(this.outputDir, `shot-${i + 1}-start.png`);
      const endPath = path.join(this.outputDir, `shot-${i + 1}-end.png`);

      this.keyframes[i] = {
        startPath,
        endPath,
        startPrompt,
        endPrompt,
        startReady: fs.existsSync(startPath),
        endReady: fs.existsSync(endPath),
      };

      emitSSE(this.projectId, 'keyframe', {
        shotIndex: i,
        startPrompt,
        endPrompt,
        startReady: this.keyframes[i].startReady,
        endReady: this.keyframes[i].endReady,
      });
    }

    // Check-in: review keyframes
    this.setState(STATES.DESIGN, SUBSTATES.DESIGN_REVIEWING);

    const readyCount = Object.values(this.keyframes).filter(k => k.startReady).length;
    await this.checkIn(
      `Keyframe design complete. ${readyCount}/${this.shotPlan.length} shots have images ready.\n\n` +
      `Upload keyframe images to:\n${this.outputDir}\n\n` +
      `File pattern: shot-{N}-start.png, shot-{N}-end.png\n\nApprove when ready.`,
      { type: 'design-review', choices: ['approve', 'abort'] }
    );

    this.guardAbort();
    this.setState(STATES.DESIGN, SUBSTATES.DESIGN_APPROVED);

    // Re-check which keyframes are present after user approval
    for (let i = 0; i < this.shotPlan.length; i++) {
      this.keyframes[i].startReady = fs.existsSync(this.keyframes[i].startPath);
      this.keyframes[i].endReady = fs.existsSync(this.keyframes[i].endPath);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: GENERATE — Submit each shot in Keyframe mode, evaluate, approve
  // ═══════════════════════════════════════════════════════════════════════════

  async phaseGenerate() {
    this.setState(STATES.GENERATE);
    this.addLog('Starting generation phase...');

    // Serial generation for continuity: shot N's last frame feeds shot N+1
    for (let i = 0; i < this.shotPlan.length; i++) {
      await this.guardPause();
      await this.generateShot(i);
    }
  }

  async generateShot(idx) {
    const shot = this.shotPlan[idx];
    const gen = this.generations[idx];
    const kf = this.keyframes[idx];

    gen.attempts++;
    gen.state = 'submitting';
    this.setState(STATES.GENERATE, SUBSTATES.GENERATE_SUBMITTING);
    this.addLog(`Generating shot ${idx + 1}/${this.shotPlan.length}: "${shot.name}" (attempt ${gen.attempts})`);

    try {
      // Determine start frame: use previous shot's last frame for continuity, or keyframe
      let startFramePath = kf.startPath;

      // If this is shot 2+ and previous shot has a last frame, use it for continuity
      if (idx > 0) {
        const prevLastFramePath = path.join(this.outputDir, `shot-${idx}-lastframe.png`);
        if (fs.existsSync(prevLastFramePath)) {
          startFramePath = prevLastFramePath;
          this.addLog(`Using shot ${idx}'s last frame as start frame for continuity`);
        }
      }

      // Verify start frame exists
      if (!fs.existsSync(startFramePath)) {
        throw new Error(`Start frame not found: ${startFramePath}`);
      }

      // Submit via platform
      const result = await submitKeyframeGeneration(this.platformSession, {
        startFramePath,
        endFramePath: kf.endReady ? kf.endPath : null,
        prompt: shot.prompt,
        settings: {
          draft: this.settings.draft,
        },
        boardId: this.boardId,
      });

      gen.id = result.id;
      gen.state = 'polling';
      this.setState(STATES.GENERATE, SUBSTATES.GENERATE_POLLING);
      this.addLog(`Shot ${idx + 1} submitted (ID: ${result.id}), polling...`);
      this.creditsUsed += this.settings.draft ? 20 : 330;

      // Poll until complete
      const completed = await waitForGeneration(this.platformSession, result.id, {
        timeoutMs: 300000,
        onProgress: ({ state }) => {
          emitSSE(this.projectId, 'generation-progress', { shotIndex: idx, state });
        },
      });

      gen.videoUrl = completed.videoUrl;
      gen.state = 'evaluating';
      this.setState(STATES.GENERATE, SUBSTATES.GENERATE_EVALUATING);

      // Download last frame for chaining to next shot
      const lastFrameDest = path.join(this.outputDir, `shot-${idx + 1}-lastframe.png`);
      if (completed.lastFrameUrl) {
        await downloadFile(completed.lastFrameUrl, lastFrameDest);
        this.addLog(`Shot ${idx + 1} last frame saved for chaining`);
      }

      // Evaluate via Claude Vision
      const screenshot = await this.platformSession.screenshot();
      const screenshotB64 = screenshot.toString('base64');
      const evaluation = await evaluateGeneration(
        screenshotB64, shot, this.arcData, null, this.anthropicKey
      );

      gen.score = evaluation.score;

      emitSSE(this.projectId, 'evaluation', {
        shotIndex: idx,
        score: evaluation.score,
        assessment: evaluation.assessment,
        recommendation: evaluation.recommendation,
      });

      // Decision
      if (evaluation.score >= this.settings.autoApproveThreshold) {
        gen.state = 'approved';
        this.addLog(`Shot ${idx + 1} auto-approved (${evaluation.score}/100)`);
      } else if (gen.attempts < this.settings.maxRetries) {
        // Check in with human
        const response = await this.checkIn(
          `Shot ${idx + 1} "${shot.name}" scored ${evaluation.score}/100.\n\n` +
          `${evaluation.assessment}\n\nIssues: ${evaluation.issues.join(', ')}\n\n` +
          `Regenerate, modify prompt, or approve as-is?`,
          {
            type: 'generation-result',
            shotIndex: idx,
            evaluation,
            screenshotB64,
            choices: ['regenerate', 'approve', 'abort'],
          }
        );

        if (response === 'abort' || response?.action === 'abort') {
          this.aborted = true;
          throw new Error('Session aborted');
        } else if (response === 'approve' || response?.action === 'approve') {
          gen.state = 'approved';
          this.addLog(`Shot ${idx + 1} manually approved.`);
        } else {
          // Regenerate
          this.addLog(`Shot ${idx + 1} regenerating...`);
          await this.generateShot(idx);
          return;
        }
      } else {
        // Max retries — force approve or skip
        const response = await this.checkIn(
          `Shot ${idx + 1}: ${gen.attempts} attempts exhausted. Best score: ${evaluation.score}/100. Approve or skip?`,
          { type: 'generation-result', shotIndex: idx, evaluation, choices: ['approve', 'skip'] }
        );
        gen.state = response === 'skip' ? 'failed' : 'approved';
      }

      this.emitState();

    } catch (e) {
      if (e.message === 'Session aborted') throw e;
      gen.state = 'failed';
      gen.score = 0;
      this.addLog(`Shot ${idx + 1} error: ${e.message}`, 'error');
      this.emitState();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: CHAIN — Extend Video to stitch shots seamlessly
  // ═══════════════════════════════════════════════════════════════════════════

  async phaseChain() {
    this.setState(STATES.CHAIN);
    const approvedShots = Object.entries(this.generations)
      .filter(([, g]) => g.state === 'approved')
      .map(([idx]) => parseInt(idx));

    if (approvedShots.length < 2) {
      this.addLog('Fewer than 2 approved shots — skipping chain phase.');
      return;
    }

    this.addLog(`Chaining ${approvedShots.length} shots via Extend Video...`);

    // Chain sequentially: shot[0] → extend → shot[1] → extend → shot[2]
    for (let i = 1; i < approvedShots.length; i++) {
      await this.guardPause();

      const prevIdx = approvedShots[i - 1];
      const currIdx = approvedShots[i];
      const prevGen = this.generations[prevIdx];
      const currKf = this.keyframes[currIdx];

      this.setState(STATES.CHAIN, SUBSTATES.CHAIN_EXTENDING);
      this.addLog(`Extending shot ${prevIdx + 1} → shot ${currIdx + 1}...`);

      try {
        const result = await extendWithEndFrame(this.platformSession, {
          generationId: prevGen.id,
          endFramePath: currKf.endReady ? currKf.endPath : null,
          prompt: this.shotPlan[currIdx].prompt,
          boardId: this.boardId,
        });

        this.chainedIds[currIdx] = result.id;
        this.creditsUsed += 20;

        // Wait for extension to complete
        this.setState(STATES.CHAIN, SUBSTATES.CHAIN_EVALUATING);
        const completed = await waitForGeneration(this.platformSession, result.id, {
          timeoutMs: 300000,
        });

        this.addLog(`Chain ${prevIdx + 1}→${currIdx + 1} complete`);

        // Save last frame for next chain
        if (completed.lastFrameUrl) {
          const dest = path.join(this.outputDir, `chain-${currIdx + 1}-lastframe.png`);
          await downloadFile(completed.lastFrameUrl, dest);
        }

      } catch (e) {
        this.addLog(`Chain ${prevIdx + 1}→${currIdx + 1} failed: ${e.message}`, 'error');
      }
    }

    this.addLog('Chain phase complete.');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: POLISH — Upscale+HDR, Audio, Reframe
  // ═══════════════════════════════════════════════════════════════════════════

  async phasePolish() {
    this.setState(STATES.POLISH);
    this.addLog('Starting polish phase...');

    const approvedShots = Object.entries(this.generations)
      .filter(([, g]) => g.state === 'approved')
      .map(([idx]) => parseInt(idx));

    for (const idx of approvedShots) {
      await this.guardPause();

      const genId = this.chainedIds[idx] || this.generations[idx].id;
      if (!genId) continue;

      // Upscale + HDR
      if (this.settings.polishUpscale) {
        try {
          this.setState(STATES.POLISH, SUBSTATES.POLISH_UPSCALING);
          this.addLog(`Upscaling shot ${idx + 1}...`);

          const result = await upscaleGeneration(this.platformSession, {
            generationId: genId,
            boardId: this.boardId,
          });
          this.polishStates[idx].upscaleId = result.id;
          this.creditsUsed += 50;

          await waitForGeneration(this.platformSession, result.id, { timeoutMs: 300000 });
          this.addLog(`Shot ${idx + 1} upscaled.`);
        } catch (e) {
          this.addLog(`Shot ${idx + 1} upscale failed: ${e.message}`, 'warn');
        }
      }

      // Audio
      if (this.settings.polishAudio) {
        try {
          this.setState(STATES.POLISH, SUBSTATES.POLISH_AUDIO);
          const audioId = this.polishStates[idx].upscaleId || genId;
          this.addLog(`Adding audio to shot ${idx + 1}...`);

          const audioPrompt = buildAudioPrompt(this.shotPlan[idx], this.arcData);
          const result = await addAudioOnPlatform(this.platformSession, {
            generationId: audioId,
            audioPrompt,
            boardId: this.boardId,
          });
          this.polishStates[idx].audioId = result.id;
          this.creditsUsed += 20;

          await waitForGeneration(this.platformSession, result.id, { timeoutMs: 300000 });
          this.addLog(`Shot ${idx + 1} audio added.`);
        } catch (e) {
          this.addLog(`Shot ${idx + 1} audio failed: ${e.message}`, 'warn');
        }
      }

      // Reframe (optional — for platform-specific aspect ratios)
      if (this.settings.polishReframe) {
        try {
          this.setState(STATES.POLISH, SUBSTATES.POLISH_REFRAME);
          const reframeId = this.polishStates[idx].audioId
            || this.polishStates[idx].upscaleId
            || genId;
          this.addLog(`Reframing shot ${idx + 1} to ${this.settings.polishReframe}...`);

          // Skip if already correct aspect
          // (reframe is expensive, only do when target differs)
          // For now, always apply if setting is set
          // TODO: detect current aspect and skip if matching

        } catch (e) {
          this.addLog(`Shot ${idx + 1} reframe failed: ${e.message}`, 'warn');
        }
      }

      this.emitState();
    }

    this.addLog('Polish phase complete.');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: DELIVER — Download finals, assemble
  // ═══════════════════════════════════════════════════════════════════════════

  async phaseDeliver() {
    this.setState(STATES.DELIVER);
    this.addLog('Downloading final videos...');

    const approvedShots = Object.entries(this.generations)
      .filter(([, g]) => g.state === 'approved')
      .map(([idx]) => parseInt(idx));

    const assemblyInputs = [];

    for (const idx of approvedShots) {
      // Use the most polished version available
      const finalId = this.polishStates[idx]?.audioId
        || this.polishStates[idx]?.upscaleId
        || this.chainedIds[idx]
        || this.generations[idx].id;

      if (!finalId) continue;

      const destPath = path.join(this.outputDir, `final-shot-${idx + 1}.mp4`);

      try {
        const videoUrl = await this.platformSession.getVideoUrl(finalId);
        if (videoUrl) {
          await downloadFile(videoUrl, destPath);
          this.addLog(`Shot ${idx + 1} downloaded: ${destPath}`);
          assemblyInputs.push({
            videoUrl,
            localPath: destPath,
            cutType: this.shotPlan[idx].cutType || 'hard cut',
            name: this.shotPlan[idx].name,
          });
        }
      } catch (e) {
        this.addLog(`Shot ${idx + 1} download failed: ${e.message}`, 'error');
      }
    }

    // FFmpeg assembly
    if (assemblyInputs.length > 1) {
      this.addLog('Assembling final video...');
      try {
        const result = await assembleSequence(assemblyInputs, {
          projectId: this.projectId,
          outputDir: this.outputDir,
        });
        this.addLog(`Assembly complete: ${result.outputPath} (${result.duration?.toFixed(1)}s)`);
      } catch (e) {
        this.addLog(`Assembly failed: ${e.message}`, 'error');
      }
    } else if (assemblyInputs.length === 1) {
      this.addLog('Single shot — no assembly needed.');
    } else {
      this.addLog('No shots to deliver.', 'warn');
    }
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  pause() {
    this.paused = true;
    this.addLog('Session paused.');
    this.emitState();
  }

  resume() {
    this.paused = false;
    this.addLog('Session resumed.');
    this.emitState();
  }

  abort() {
    this.aborted = true;
    this.addLog('Session abort requested.');
    if (this.pendingResponse) {
      this.pendingResponse('abort');
      this.pendingResponse = null;
    }
    this.emitState();
  }
}

// ─── Helper: Build keyframe image prompt ────────────────────────────────────

function buildKeyframePrompt(shot, arcData, position) {
  const beat = arcData?.beats?.[shot.beatIndex ?? 0];
  const feeling = beat?.feeling || '';

  if (position === 'start') {
    return `Opening frame for "${shot.name}". ` +
      `${shot.prompt.replace(/camera\s+\w+/gi, '').trim()} ` +
      `Frozen moment before the action begins. ` +
      `Mood: ${feeling}. Still photograph, no motion.`;
  }

  return `Closing frame for "${shot.name}". ` +
    `The result of the action described: ${shot.prompt.replace(/camera\s+\w+/gi, '').trim()} ` +
    `Frozen moment after the action completes. ` +
    `Mood: ${feeling}. Still photograph, no motion.`;
}

// ─── Helper: Build audio prompt from shot context ───────────────────────────

function buildAudioPrompt(shot, arcData) {
  const beat = arcData?.beats?.[shot.beatIndex ?? 0];
  const feeling = beat?.feeling || 'neutral';
  const pos = beat?.position ?? 0.5;

  let intensity = 'moderate';
  if (pos < 0.2) intensity = 'building, anticipatory';
  else if (pos < 0.4) intensity = 'growing, deepening';
  else if (pos < 0.6) intensity = 'peak, pivotal';
  else if (pos < 0.8) intensity = 'resolving, confident';
  else intensity = 'final, conclusive';

  return `${feeling} mood. ${intensity} energy. ` +
    `Cinematic ambient score, no dialogue, no lyrics. ` +
    `Match the visual rhythm of the scene.`;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function startAuteurSession(project, run, mode, settings, anthropicKey) {
  const session = new AuteurSession(project.id, run.id, mode, settings, anthropicKey);

  // Start async — don't await
  session.run(project, run).catch(e => {
    session.state = STATES.ERROR;
    session.addLog(`Fatal: ${e.message}`, 'error');
    session.emitState();
  });

  return session;
}
