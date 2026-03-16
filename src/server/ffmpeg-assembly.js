/**
 * FFMPEG ASSEMBLY PIPELINE
 *
 * Downloads completed generation videos, concatenates with transitions,
 * layers audio, and exports a finished MP4.
 *
 * Transition mapping from shot.cutType metadata:
 *   "hard cut"      -> direct concat (no transition)
 *   "match cut"     -> xfade=transition=fade:duration=0.5
 *   "smash cut"     -> direct concat (0-frame gap)
 *   "cut on action" -> xfade=transition=wipeleft:duration=0.3
 *   "fade out"      -> xfade=transition=fade:duration=1.0
 *   "dissolve"      -> xfade=transition=dissolve:duration=0.8
 *
 * Output: data/assembly/{projectId}/final.mp4
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { downloadFile } from './luma-platform.js';

const execFileAsync = promisify(execFile);

const ASSEMBLY_DIR = path.resolve(process.cwd(), 'data', 'assembly');

// ─── Transition mapping ──────────────────────────────────────────────────────

const TRANSITION_MAP = {
  'hard cut':      { type: null, duration: 0 },
  'match cut':     { type: 'fade', duration: 0.5 },
  'smash cut':     { type: null, duration: 0 },
  'cut on action': { type: 'wipeleft', duration: 0.3 },
  'fade out':      { type: 'fade', duration: 1.0 },
  'dissolve':      { type: 'dissolve', duration: 0.8 },
};

/**
 * Map a shot's cutType to FFmpeg xfade parameters.
 * @param {string} cutType
 * @returns {{ type: string|null, duration: number }}
 */
export function mapCutToTransition(cutType) {
  return TRANSITION_MAP[cutType?.toLowerCase()] || { type: null, duration: 0 };
}

// ─── Assembly state ──────────────────────────────────────────────────────────

const assemblyState = {};

/**
 * Get the current assembly progress for a project.
 * @param {string} projectId
 * @returns {{ phase, percent, currentStep, error } | null}
 */
export function getAssemblyProgress(projectId) {
  return assemblyState[projectId] || null;
}

function updateProgress(projectId, phase, percent, currentStep) {
  assemblyState[projectId] = { phase, percent, currentStep, error: null };
}

function setError(projectId, error) {
  if (assemblyState[projectId]) {
    assemblyState[projectId].error = error;
    assemblyState[projectId].phase = 'error';
  }
}

// ─── Download videos ─────────────────────────────────────────────────────────

/**
 * Download a video from a URL to a destination path.
 * @param {string} url - CDN video URL
 * @param {string} destPath - Local file path
 */
export async function downloadVideo(url, destPath) {
  await downloadFile(url, destPath);
}

// ─── FFmpeg probing ──────────────────────────────────────────────────────────

/**
 * Probe a video file for duration.
 * @param {string} filePath
 * @returns {Promise<number>} duration in seconds
 */
async function probeDuration(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 5; // fallback to 5s if probe fails
  }
}

// ─── Core assembly ───────────────────────────────────────────────────────────

/**
 * Assemble a sequence of shots into a final MP4.
 *
 * @param {Array} shots - Array of { videoUrl, cutType, audioUrl?, name }
 * @param {Object} options - { projectId, audioTrackUrl?, brandCardPath?, outputName? }
 * @returns {Promise<{ outputPath, duration }>}
 */
export async function assembleSequence(shots, options = {}) {
  const projectId = options.projectId || 'default';
  const projectDir = path.join(ASSEMBLY_DIR, projectId);
  const clipsDir = path.join(projectDir, 'clips');
  const outputPath = path.join(projectDir, options.outputName || 'final.mp4');

  // Ensure directories exist
  if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

  try {
    // ── Phase 1: Download all clips ────────────────────────────────────────
    updateProgress(projectId, 'download', 0, 'Downloading clips...');
    const clipPaths = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      if (!shot.videoUrl) throw new Error(`Shot ${i + 1} has no video URL`);

      const clipPath = path.join(clipsDir, `clip-${String(i).padStart(3, '0')}.mp4`);
      updateProgress(projectId, 'download', Math.round((i / shots.length) * 30), `Downloading clip ${i + 1}/${shots.length}`);

      await downloadVideo(shot.videoUrl, clipPath);
      clipPaths.push(clipPath);
    }

    // ── Phase 2: Build FFmpeg filter graph ─────────────────────────────────
    updateProgress(projectId, 'transitions', 30, 'Building transition graph...');

    // Probe durations
    const durations = [];
    for (const cp of clipPaths) {
      durations.push(await probeDuration(cp));
    }

    if (clipPaths.length === 1) {
      // Single clip — just copy
      fs.copyFileSync(clipPaths[0], outputPath);
      updateProgress(projectId, 'complete', 100, 'Done');
      return { outputPath, duration: durations[0] };
    }

    // Build xfade filter chain
    const transitions = [];
    for (let i = 1; i < shots.length; i++) {
      transitions.push(mapCutToTransition(shots[i].cutType));
    }

    const hasTransitions = transitions.some(t => t.type !== null);

    if (!hasTransitions) {
      // Simple concat — no transitions
      await simpleConcatenate(clipPaths, outputPath, projectId);
    } else {
      // xfade filter graph
      await xfadeConcatenate(clipPaths, durations, transitions, outputPath, projectId);
    }

    // ── Phase 3: Audio overlay ────────────────────────────────────────────
    if (options.audioTrackUrl) {
      updateProgress(projectId, 'audio', 80, 'Layering audio...');
      const audioPath = path.join(projectDir, 'audio-track.mp3');
      await downloadVideo(options.audioTrackUrl, audioPath);

      const withAudioPath = path.join(projectDir, 'final-with-audio.mp4');
      await execFileAsync('ffmpeg', [
        '-y', '-i', outputPath, '-i', audioPath,
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k',
        '-map', '0:v:0', '-map', '1:a:0',
        '-shortest',
        withAudioPath,
      ]);
      fs.renameSync(withAudioPath, outputPath);
    }

    // ── Phase 4: Final encode ─────────────────────────────────────────────
    updateProgress(projectId, 'complete', 100, 'Assembly complete');

    const finalDuration = await probeDuration(outputPath);
    return { outputPath, duration: finalDuration };

  } catch (e) {
    setError(projectId, e.message);
    throw e;
  }
}

// ─── Concatenation strategies ────────────────────────────────────────────────

/**
 * Simple concat (no transitions) using concat demuxer.
 */
async function simpleConcatenate(clipPaths, outputPath, projectId) {
  updateProgress(projectId, 'encode', 50, 'Concatenating clips...');

  const listPath = outputPath.replace('.mp4', '-list.txt');
  const listContent = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listPath, listContent);

  await execFileAsync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', listPath,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outputPath,
  ]);

  try { fs.unlinkSync(listPath); } catch { /* cleanup */ }
}

/**
 * xfade concatenation with per-shot transitions.
 */
async function xfadeConcatenate(clipPaths, durations, transitions, outputPath, projectId) {
  updateProgress(projectId, 'transitions', 40, 'Applying transitions...');

  // Build complex filter graph
  // Each xfade takes two inputs, produces one output
  const inputs = clipPaths.map((_, i) => `-i ${clipPaths[i]}`).join(' ');
  const filterParts = [];
  let prevLabel = '0:v';
  let offset = durations[0];

  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    const nextInput = `${i + 1}:v`;
    const outLabel = i < transitions.length - 1 ? `v${i}` : 'vout';

    if (t.type) {
      const transitionOffset = Math.max(0, offset - t.duration);
      filterParts.push(
        `[${prevLabel}][${nextInput}]xfade=transition=${t.type}:duration=${t.duration}:offset=${transitionOffset.toFixed(3)}[${outLabel}]`
      );
      offset = transitionOffset + durations[i + 1];
    } else {
      // Hard cut — just concat these two with 0 duration xfade
      filterParts.push(
        `[${prevLabel}][${nextInput}]xfade=transition=fade:duration=0.01:offset=${offset.toFixed(3)}[${outLabel}]`
      );
      offset = offset + durations[i + 1];
    }
    prevLabel = outLabel;
  }

  const filterGraph = filterParts.join(';');

  updateProgress(projectId, 'encode', 60, 'Encoding final video...');

  const args = [];
  for (const cp of clipPaths) {
    args.push('-i', cp);
  }
  args.push(
    '-filter_complex', filterGraph,
    '-map', `[vout]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-movflags', '+faststart',
    '-y', outputPath,
  );

  await execFileAsync('ffmpeg', args, { timeout: 300000 });
}

/**
 * Get the assembly output path for a project.
 * @param {string} projectId
 * @returns {string}
 */
export function getAssemblyOutputPath(projectId) {
  return path.join(ASSEMBLY_DIR, projectId, 'final.mp4');
}

/**
 * Check if assembly output exists for a project.
 * @param {string} projectId
 * @returns {boolean}
 */
export function hasAssemblyOutput(projectId) {
  return fs.existsSync(getAssemblyOutputPath(projectId));
}
