/**
 * ASSEMBLY PANEL
 *
 * FFmpeg assembly progress + download UI.
 * Mounted below shot list when all finals are complete.
 *
 * Shows: progress bar (download -> transitions -> audio -> encode -> done),
 * preview player when complete, download MP4 button.
 */

import { useState, useEffect, useRef } from 'react';
import { S, COLORS } from '../styles/theme.js';
import { startAssembly, pollAssemblyStatus, getDownloadUrl } from '../lib/assembly-client.js';

const POLL_MS = 2000;

const PHASE_LABELS = {
  idle: 'READY',
  download: 'DOWNLOADING',
  transitions: 'TRANSITIONS',
  audio: 'AUDIO',
  encode: 'ENCODING',
  complete: 'COMPLETE',
  error: 'ERROR',
};

const PHASE_COLORS = {
  idle: COLORS.textDim,
  download: '#6a8ab8',
  transitions: '#b89c4a',
  audio: '#8a6ab8',
  encode: '#b89c4a',
  complete: COLORS.scoreGood,
  error: COLORS.scoreError,
};

export default function AssemblyPanel({ projectId, runId, shotsReady }) {
  const [progress, setProgress] = useState(null);
  const [assembling, setAssembling] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const pollRef = useRef(null);

  // Poll assembly status
  useEffect(() => {
    if (!assembling) return;

    pollRef.current = setInterval(async () => {
      const status = await pollAssemblyStatus(projectId);
      if (!status) return;
      setProgress(status);

      if (status.phase === 'complete') {
        setAssembling(false);
        setDownloadReady(true);
        clearInterval(pollRef.current);
      }
      if (status.phase === 'error') {
        setAssembling(false);
        clearInterval(pollRef.current);
      }
    }, POLL_MS);

    return () => clearInterval(pollRef.current);
  }, [assembling, projectId]);

  const handleStart = async () => {
    setAssembling(true);
    setProgress({ phase: 'download', percent: 0, currentStep: 'Starting...' });
    try {
      await startAssembly(projectId, runId);
    } catch (e) {
      setProgress({ phase: 'error', percent: 0, currentStep: e.message, error: e.message });
      setAssembling(false);
    }
  };

  const handleDownload = () => {
    window.open(`/api/assembly/download/${projectId}`, '_blank');
  };

  const phase = progress?.phase || 'idle';
  const percent = progress?.percent || 0;
  const step = progress?.currentStep || '';

  return (
    <div style={{
      ...S.card,
      marginTop: '16px',
      borderColor: phase === 'complete' ? 'rgba(90,154,106,0.2)' : COLORS.border,
    }}>
      <div style={{ ...S.cardHead, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>ASSEMBLY</span>
        <span style={{ color: PHASE_COLORS[phase], letterSpacing: '1px' }}>
          {PHASE_LABELS[phase]}
        </span>
      </div>

      {/* Progress bar */}
      {(assembling || phase === 'complete') && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            width: '100%',
            height: '4px',
            background: 'rgba(232,228,222,0.06)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${percent}%`,
              height: '100%',
              background: PHASE_COLORS[phase],
              transition: 'width 0.3s ease',
              borderRadius: '2px',
            }} />
          </div>
          <div style={{ ...S.mono, fontSize: '8px', color: COLORS.textDim, marginTop: '4px' }}>
            {step}
          </div>
        </div>
      )}

      {/* Error */}
      {progress?.error && (
        <div style={{ ...S.mono, fontSize: '9px', color: COLORS.scoreError, marginBottom: '8px' }}>
          {progress.error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {phase === 'idle' && shotsReady && (
          <button onClick={handleStart} style={{
            ...S.btnSec,
            fontSize: '9px',
            padding: '8px 16px',
            color: COLORS.scoreGood,
            borderColor: 'rgba(90,154,106,0.3)',
          }}>
            ASSEMBLE MP4
          </button>
        )}

        {assembling && (
          <button disabled style={{
            ...S.btnSec,
            fontSize: '9px',
            padding: '8px 16px',
            color: '#b89c4a',
            borderColor: 'rgba(184,156,74,0.3)',
            animation: 'pulse 1.5s infinite',
          }}>
            ASSEMBLING...
          </button>
        )}

        {downloadReady && (
          <button onClick={handleDownload} style={{
            ...S.btnSec,
            fontSize: '9px',
            padding: '8px 16px',
            color: COLORS.scoreGood,
            borderColor: 'rgba(90,154,106,0.3)',
          }}>
            DOWNLOAD MP4
          </button>
        )}

        {!shotsReady && phase === 'idle' && (
          <span style={{ ...S.mono, fontSize: '8px', color: COLORS.textDim }}>
            Complete all shots to enable assembly
          </span>
        )}
      </div>
    </div>
  );
}
