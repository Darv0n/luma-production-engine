/**
 * DREAM MACHINE SESSION
 *
 * Server-side autonomous operation loop that drives Dream Machine
 * through the full generation pipeline, checking in with the human
 * at critical inflection points.
 *
 * The loop is long-running (30-60 min for a full project). It needs
 * Playwright, Claude API, and file system access. The client receives
 * updates via SSE (Server-Sent Events).
 *
 * Lifecycle:
 *   1. Create board for project
 *   2. CHECK-IN: board created, generating first batch
 *   3. For each shot: generate, poll, screenshot, evaluate
 *   4. Auto-approve if score >= threshold, else CHECK-IN
 *   5. Continuity pass: grab stills, re-chain weak transitions
 *   6. Assembly: FFmpeg pipeline
 *   7. CHECK-IN: complete, ready for download
 */

import { evaluateGeneration } from './dream-evaluator.js';
import {
  createBoard,
  generateOnPlatform,
  getGenerationStatus,
  extractStillFrame,
  modifyGeneration,
  captureScreenshot,
  downloadGeneration,
  reviewBoard,
} from './luma-platform.js';
import { assembleSequence } from './ffmpeg-assembly.js';
import path from 'path';

// ─── Active sessions ────────────────────────────────────────────────────────

const sessions = new Map();

/**
 * Get an active session by project ID.
 */
export function getSession(projectId) {
  return sessions.get(projectId) || null;
}

// ─── SSE client management ──────────────────────────────────────────────────

const sseClients = new Map(); // projectId -> Set<res>

export function addSSEClient(projectId, res) {
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

// ─── Dream Machine Session ──────────────────────────────────────────────────

export class DreamMachineSession {
  constructor(projectId, runId, settings, anthropicKey) {
    this.projectId = projectId;
    this.runId = runId;
    this.boardId = null;
    this.shots = [];
    this.shotStates = [];
    this.phase = 'setup';      // setup | generating | reviewing | continuity | assembly | complete | paused | error
    this.checkInQueue = [];    // messages waiting for human response
    this.pendingResponse = null;
    this.log = [];
    this.paused = false;
    this.aborted = false;
    this.settings = {
      autoApproveThreshold: settings?.autoApproveThreshold ?? 80,
      maxRetries: settings?.maxRetries ?? 3,
      batchSize: settings?.batchSize ?? 3,
      continuityPass: settings?.continuityPass !== false,
      ...settings,
    };
    this.anthropicKey = anthropicKey;
    this.vision = settings?.vision || null;
  }

  addLog(message, type = 'info') {
    const entry = { timestamp: new Date().toISOString(), message, type };
    this.log.push(entry);
    emitSSE(this.projectId, 'log', entry);
  }

  getState() {
    return {
      projectId: this.projectId,
      runId: this.runId,
      boardId: this.boardId,
      phase: this.phase,
      shots: this.shots.map(s => ({ name: s.name, prompt: s.prompt })),
      shotStates: this.shotStates,
      checkIn: this.checkInQueue.length > 0 ? this.checkInQueue[0] : null,
      paused: this.paused,
    };
  }

  emitState() {
    emitSSE(this.projectId, 'state', this.getState());
  }

  // ── Check-in: pause and wait for human response ──────────────────────────

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

    // Wait for human response
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

  // ── Main entry point ─────────────────────────────────────────────────────

  async start(project, run) {
    this.shots = run.shots || [];
    this.shotStates = this.shots.map(() => ({
      status: 'waiting',  // waiting | generating | completed | failed | reviewing | approved
      generationId: null,
      videoUrl: null,
      attempts: 0,
      evaluation: null,
    }));

    sessions.set(this.projectId, this);
    this.emitState();

    try {
      // ── 1. Create board ────────────────────────────────────────────────
      this.phase = 'setup';
      this.addLog('Creating board on Dream Machine...');
      const boardResult = await createBoard(project.name || `project-${this.projectId}`);
      this.boardId = boardResult.boardId;
      this.addLog(`Board created: ${boardResult.url}`);
      this.emitState();

      // ── 2. Check-in: board ready ──────────────────────────────────────
      const batchDesc = this.shots.slice(0, this.settings.batchSize)
        .map((s, i) => `  ${i + 1}. "${s.name}"`).join('\n');
      await this.checkIn(
        `Board created. Generating first ${Math.min(this.settings.batchSize, this.shots.length)} shots:\n${batchDesc}\n\nwdyt?`,
        { type: 'check-in' }
      );

      // ── 3. Process shots in batches ───────────────────────────────────
      this.phase = 'generating';
      this.emitState();

      for (let i = 0; i < this.shots.length; i++) {
        if (this.aborted) break;
        while (this.paused) {
          await new Promise(r => setTimeout(r, 1000));
          if (this.aborted) break;
        }
        if (this.aborted) break;

        await this.processShot(i);

        // Batch check-in
        if ((i + 1) % this.settings.batchSize === 0 && i + 1 < this.shots.length) {
          const completed = this.shotStates.filter(s => s.status === 'approved').length;
          const remaining = this.shots.length - (i + 1);
          await this.checkIn(
            `Batch complete: ${completed} approved so far, ${remaining} remaining. Continuing?`,
            { type: 'check-in' }
          );
        }
      }

      if (this.aborted) {
        this.phase = 'error';
        this.addLog('Session aborted by user.', 'error');
        this.emitState();
        return;
      }

      // ── 4. Continuity pass ──────────────────────────────────────────
      if (this.settings.continuityPass) {
        this.phase = 'continuity';
        this.addLog('Starting continuity pass...');
        this.emitState();
        await this.runContinuityPass();
      }

      // ── 5. Assembly ─────────────────────────────────────────────────
      this.phase = 'assembly';
      this.addLog('Starting FFmpeg assembly...');
      this.emitState();

      const assemblyShots = this.shots.map((shot, i) => ({
        videoUrl: this.shotStates[i].videoUrl,
        cutType: shot.cutType || 'hard cut',
        name: shot.name,
      })).filter(s => s.videoUrl);

      if (assemblyShots.length > 0) {
        const result = await assembleSequence(assemblyShots, {
          projectId: this.projectId,
        });
        this.addLog(`Assembly complete: ${result.outputPath} (${result.duration?.toFixed(1)}s)`);
      }

      // ── 6. Complete ─────────────────────────────────────────────────
      this.phase = 'complete';
      this.addLog('Dream Machine session complete.');
      this.emitState();
      emitSSE(this.projectId, 'complete', { assemblyReady: assemblyShots.length > 0 });

      await this.checkIn('Session complete. All shots processed and assembled. Ready for download.', {
        type: 'check-in',
      });

    } catch (e) {
      this.phase = 'error';
      this.addLog(`Session error: ${e.message}`, 'error');
      this.emitState();
    }
  }

  // ── Process a single shot ─────────────────────────────────────────────────

  async processShot(idx) {
    const shot = this.shots[idx];
    const state = this.shotStates[idx];

    state.status = 'generating';
    state.attempts++;
    this.addLog(`Generating shot ${idx + 1}: "${shot.name}"...`);
    this.emitState();

    try {
      // Submit generation on platform
      const gen = await generateOnPlatform(shot, this.boardId);
      state.generationId = gen.id;
      this.addLog(`Shot ${idx + 1} submitted (ID: ${gen.id})`);

      // Poll until complete
      let genStatus;
      const pollDeadline = Date.now() + 600000; // 10 min timeout
      while (Date.now() < pollDeadline) {
        if (this.aborted) return;

        await new Promise(r => setTimeout(r, 5000));
        genStatus = await getGenerationStatus(gen.id);

        if (genStatus?.state === 'completed' || genStatus?.artifact?.video?.url) {
          state.videoUrl = genStatus.artifact?.video?.url || null;
          break;
        }
        if (genStatus?.state === 'failed') {
          throw new Error(`Generation failed: ${genStatus.failure_reason || 'unknown'}`);
        }
      }

      if (!state.videoUrl) {
        throw new Error('Generation timed out');
      }

      // Screenshot + evaluate
      state.status = 'reviewing';
      this.emitState();

      const screenshot = await captureScreenshot({
        url: `https://dream-machine.lumalabs.ai/board/${this.boardId}/idea/${gen.id}`,
      });

      const evaluation = await this.evaluateResult(screenshot.imageBase64, shot);
      state.evaluation = evaluation;

      emitSSE(this.projectId, 'screenshot', {
        shotIndex: idx,
        imageBase64: screenshot.imageBase64,
        evaluation,
      });

      // Decision
      if (evaluation.score >= this.settings.autoApproveThreshold) {
        state.status = 'approved';
        this.addLog(`Shot ${idx + 1} auto-approved (${evaluation.score}/100): ${evaluation.assessment}`);
        emitSSE(this.projectId, 'log', {
          timestamp: new Date().toISOString(),
          message: `Auto-approved: ${evaluation.assessment}`,
          type: 'decision',
        });
      } else if (state.attempts < this.settings.maxRetries) {
        // Check in with human
        const response = await this.checkIn(
          `Shot ${idx + 1} "${shot.name}" scored ${evaluation.score}/100.\n\n${evaluation.assessment}\n\nIssues: ${evaluation.issues.join(', ')}\n\nRecommendation: ${evaluation.recommendation}. Regenerate, modify, or approve as-is?`,
          {
            type: 'generation-result',
            shotIndex: idx,
            evaluation,
            screenshotB64: screenshot.imageBase64,
            choices: ['regenerate', 'modify', 'approve'],
          }
        );

        if (response === 'abort' || response?.action === 'abort') {
          state.status = 'failed';
          this.addLog(`Shot ${idx + 1} aborted by user.`);
          return;
        } else if (response === 'approve' || response?.action === 'approve') {
          state.status = 'approved';
          this.addLog(`Shot ${idx + 1} manually approved.`);
        } else if (response === 'modify' || response?.action === 'modify') {
          const modPrompt = response?.prompt || shot.prompt;
          const modResult = await modifyGeneration(gen.id, modPrompt, this.boardId);
          state.generationId = modResult.id;
          this.addLog(`Shot ${idx + 1} modified, re-processing...`);
          await this.processShot(idx);
          return;
        } else {
          // Regenerate (but honor abort flag)
          if (this.aborted) return;
          this.addLog(`Shot ${idx + 1} regenerating (attempt ${state.attempts + 1})...`);
          await this.processShot(idx);
          return;
        }
      } else {
        // Max retries exceeded, ask human
        const response = await this.checkIn(
          `Shot ${idx + 1} "${shot.name}" — ${state.attempts} attempts exhausted. Best score: ${evaluation.score}/100. Approve current result or skip?`,
          {
            type: 'generation-result',
            shotIndex: idx,
            evaluation,
            choices: ['approve', 'skip'],
          }
        );
        if (response === 'abort' || response?.action === 'abort') {
          state.status = 'failed';
          return;
        }
        state.status = response === 'skip' ? 'failed' : 'approved';
      }

      this.emitState();

    } catch (e) {
      state.status = 'failed';
      state.evaluation = { score: 0, assessment: e.message, issues: ['error'], recommendation: 'regenerate' };
      this.addLog(`Shot ${idx + 1} error: ${e.message}`, 'error');
      this.emitState();
    }
  }

  // ── Vision evaluation ─────────────────────────────────────────────────────

  async evaluateResult(screenshotB64, shot) {
    const arcData = this._arcData || {};
    return evaluateGeneration(
      screenshotB64,
      shot,
      arcData,
      this.vision ? { vision: this.vision } : null,
      this.anthropicKey,
    );
  }

  // ── Continuity pass ───────────────────────────────────────────────────────

  async runContinuityPass() {
    for (let i = 0; i < this.shotStates.length; i++) {
      if (this.shotStates[i].status !== 'approved') continue;
      if (!this.shotStates[i].generationId) continue;

      try {
        const still = await extractStillFrame(this.shotStates[i].generationId);
        if (still?.url) {
          this.shotStates[i].stillUrl = still.url;
          this.addLog(`Shot ${i + 1} still extracted.`);
        }
      } catch (e) {
        this.addLog(`Continuity: shot ${i + 1} still extraction failed: ${e.message}`, 'warn');
      }
    }

    this.addLog('Continuity pass complete.');
    this.emitState();
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
    // Unblock any pending check-in
    if (this.pendingResponse) {
      this.pendingResponse('abort');
      this.pendingResponse = null;
    }
    this.emitState();
  }
}

/**
 * Start a new Dream Machine session.
 * @param {Object} project - Project object
 * @param {Object} run - Run object
 * @param {Object} settings - Dream Machine settings
 * @param {string} anthropicKey - Anthropic API key
 * @returns {DreamMachineSession}
 */
export function startDreamSession(project, run, settings, anthropicKey) {
  const session = new DreamMachineSession(project.id, run.id, settings, anthropicKey);
  session._arcData = run.stageData?.arc || {};

  // Start async — don't await
  session.start(project, run).catch(e => {
    session.phase = 'error';
    session.addLog(`Fatal: ${e.message}`, 'error');
    session.emitState();
  });

  return session;
}
