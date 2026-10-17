/**
 * DREAM MACHINE PANEL
 *
 * Live operation view for Dream Machine mode.
 * Shows: shot grid with status badges, screenshot viewer with eval overlay,
 * dialogue panel for check-ins, operation log, and session controls.
 *
 * Connects to server via SSE for real-time updates.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { S, COLORS } from '../styles/theme.js';
import {
  startDreamSession,
  connectDreamSSE,
  respondToDream,
  pauseDream,
  resumeDream,
  abortDream,
} from '../lib/luma-client.js';

// ─── Status badge colors ────────────────────────────────────────────────────

const STATUS_COLORS = {
  waiting: COLORS.textDim,
  generating: '#b89c4a',
  reviewing: '#6a8ab8',
  completed: COLORS.scoreGood,
  approved: COLORS.scoreGood,
  failed: COLORS.scoreError,
};

const STATUS_LABELS = {
  waiting: 'WAIT',
  generating: 'GEN',
  reviewing: 'EVAL',
  completed: 'DONE',
  approved: 'OK',
  failed: 'FAIL',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function DreamMachinePanel({ projectId, runId, shots, settings }) {
  const [sessionState, setSessionState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [latestScreenshot, setLatestScreenshot] = useState(null);
  const [latestEvaluation, setLatestEvaluation] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);

  const esRef = useRef(null);
  const logEndRef = useRef(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // SSE connection
  const connectSSE = useCallback(() => {
    if (esRef.current) esRef.current.close();

    const es = connectDreamSSE(projectId, (event, data) => {
      switch (event) {
        case 'state':
          setSessionState(data);
          setConnected(true);
          break;
        case 'log':
          setLogs(prev => [...prev, data]);
          break;
        case 'screenshot':
          setLatestScreenshot(data.imageBase64);
          setLatestEvaluation(data.evaluation);
          break;
        case 'complete':
          setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: 'Session complete.', type: 'complete' }]);
          break;
        case 'error':
          setConnected(false);
          break;
      }
    });

    esRef.current = es;
    return () => es.close();
  }, [projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, []);

  // ── Start session ──────────────────────────────────────────────────────

  const handleStart = async () => {
    try {
      await startDreamSession(projectId, runId);
      setStarted(true);
      connectSSE();
    } catch (e) {
      setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: `Start failed: ${e.message}`, type: 'error' }]);
    }
  };

  // ── Controls ───────────────────────────────────────────────────────────

  const handlePause = () => pauseDream(projectId);
  const handleResume = () => resumeDream(projectId);
  const handleAbort = () => {
    if (confirm('Abort the Dream Machine session? This cannot be undone.')) {
      abortDream(projectId);
    }
  };

  // ── Check-in response ─────────────────────────────────────────────────

  const handleRespond = async (action) => {
    let response;
    if (typeof action === 'string') {
      // Quick action button — include responseText if user typed steering text
      response = responseText.trim()
        ? { action, prompt: responseText }
        : action;
    } else {
      // Free-text submit (no action passed)
      response = responseText || 'approve';
    }
    await respondToDream(projectId, response);
    setResponseText('');
  };

  // ── Derived state ──────────────────────────────────────────────────────

  const phase = sessionState?.phase || 'idle';
  const shotStates = sessionState?.shotStates || [];
  const checkIn = sessionState?.checkIn || null;
  const paused = sessionState?.paused || false;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{
        ...S.card,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <span style={{ ...S.cardHead, marginBottom: 0 }}>DREAM MACHINE MODE</span>
          <span style={{
            ...S.mono,
            fontSize: '9px',
            marginLeft: '12px',
            color: phase === 'complete' ? COLORS.scoreGood
              : phase === 'error' ? COLORS.scoreError
              : '#b89c4a',
            letterSpacing: '1.5px',
          }}>
            {phase.toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {started && !['complete', 'error'].includes(phase) && (
            <>
              {paused ? (
                <button onClick={handleResume} style={{ ...S.btnSec, fontSize: '8px', padding: '4px 10px' }}>
                  RESUME
                </button>
              ) : (
                <button onClick={handlePause} style={{ ...S.btnSec, fontSize: '8px', padding: '4px 10px' }}>
                  PAUSE
                </button>
              )}
              <button onClick={handleAbort} style={{
                ...S.btnSec, fontSize: '8px', padding: '4px 10px',
                color: COLORS.scoreError, borderColor: 'rgba(192,86,74,0.3)',
              }}>
                ABORT
              </button>
            </>
          )}
        </div>
      </div>

      {/* Start button (before session) */}
      {!started && (
        <button onClick={handleStart} style={{
          ...S.btnPrimary,
          fontSize: '11px',
          padding: '16px',
          letterSpacing: '2px',
          borderColor: 'rgba(106,138,184,0.3)',
          color: '#6a8ab8',
        }}>
          START DREAM MACHINE SESSION
        </button>
      )}

      {/* Shot grid */}
      {started && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
        }}>
          {(shots || []).map((shot, i) => {
            const state = shotStates[i];
            const status = state?.status || 'waiting';
            const score = state?.evaluation?.score;
            return (
              <div
                key={i}
                title={`${shot.name} — ${status}${score !== undefined ? ` (${score}/100)` : ''}`}
                style={{
                  ...S.mono,
                  fontSize: '8px',
                  padding: '6px 10px',
                  border: `1px solid ${STATUS_COLORS[status]}33`,
                  borderRadius: '3px',
                  background: status === 'approved' ? 'rgba(90,154,106,0.06)' : 'transparent',
                  color: STATUS_COLORS[status],
                  letterSpacing: '1px',
                  minWidth: '60px',
                  textAlign: 'center',
                }}
              >
                {String(i + 1).padStart(2, '0')} {STATUS_LABELS[status]}
                {score !== undefined && (
                  <span style={{ marginLeft: '4px', opacity: 0.6 }}>{score}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Screenshot + Evaluation */}
      {latestScreenshot && (
        <div style={{ ...S.card }}>
          <div style={{ ...S.cardHead }}>LATEST GENERATION</div>
          <img
            src={`data:image/png;base64,${latestScreenshot}`}
            alt="Generation screenshot"
            style={{
              width: '100%',
              borderRadius: '3px',
              border: `1px solid ${COLORS.border}`,
              marginBottom: '8px',
            }}
          />
          {latestEvaluation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                ...S.mono,
                fontSize: '18px',
                fontWeight: 600,
                color: latestEvaluation.score >= 80 ? COLORS.scoreGood
                  : latestEvaluation.score >= 50 ? COLORS.scoreWarn
                  : COLORS.scoreError,
              }}>
                {latestEvaluation.score}
              </span>
              <span style={{ ...S.mono, fontSize: '9px', color: COLORS.textMid, flex: 1 }}>
                {latestEvaluation.assessment}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Check-in dialogue */}
      {checkIn && (
        <div style={{
          ...S.card,
          borderColor: 'rgba(106,138,184,0.2)',
          background: 'rgba(106,138,184,0.03)',
        }}>
          <div style={{ ...S.cardHead, color: '#6a8ab8' }}>AUTEUR CHECK-IN</div>
          <div style={{
            ...S.mono,
            fontSize: '11px',
            color: COLORS.text,
            lineHeight: '1.6',
            marginBottom: '12px',
            whiteSpace: 'pre-wrap',
          }}>
            {checkIn.message}
          </div>

          {/* Quick action buttons if choices provided */}
          {checkIn.options && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {checkIn.options.map((choice) => (
                <button
                  key={choice}
                  onClick={() => handleRespond(choice)}
                  style={{
                    ...S.btnSec,
                    fontSize: '9px',
                    padding: '6px 14px',
                    color: choice === 'approve' ? COLORS.scoreGood
                      : choice === 'regenerate' ? COLORS.scoreWarn
                      : COLORS.textMid,
                    borderColor: choice === 'approve' ? 'rgba(90,154,106,0.3)'
                      : choice === 'regenerate' ? 'rgba(184,156,74,0.3)'
                      : COLORS.border,
                  }}
                >
                  {choice.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Free text response */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRespond()}
              placeholder="steer the vision..."
              style={{
                ...S.input,
                fontSize: '11px',
                padding: '8px 12px',
                flex: 1,
              }}
            />
            <button
              onClick={() => handleRespond()}
              disabled={!responseText.trim()}
              style={{
                ...S.btnSec,
                fontSize: '9px',
                padding: '8px 14px',
              }}
            >
              SEND
            </button>
          </div>
        </div>
      )}

      {/* Operation log */}
      {logs.length > 0 && (
        <details open={logs.length < 20}>
          <summary style={{
            ...S.mono,
            fontSize: '8px',
            letterSpacing: '2px',
            color: COLORS.textDim,
            cursor: 'pointer',
            padding: '4px 0',
          }}>
            OPERATION LOG ({logs.length})
          </summary>
          <div style={{
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '8px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '3px',
            border: `1px solid ${COLORS.border}`,
          }}>
            {logs.map((entry, i) => (
              <div key={i} style={{
                ...S.mono,
                fontSize: '8px',
                color: entry.type === 'error' ? COLORS.scoreError
                  : entry.type === 'check-in' ? '#6a8ab8'
                  : entry.type === 'decision' ? '#b89c4a'
                  : COLORS.textDim,
                lineHeight: '1.8',
              }}>
                <span style={{ opacity: 0.4 }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                {' '}
                {entry.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </details>
      )}
    </div>
  );
}
