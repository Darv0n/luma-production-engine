/**
 * PRODUCTION VIEW
 *
 * Sprint 04 main page. Drives the Auteur production workflow.
 * Routes: /projects/:id/produce
 *
 * Flow: Mode select → THINK → DESIGN → GENERATE → CHAIN → POLISH → DELIVER
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { COLORS, FONTS, S } from '../styles/theme.js';
import { storage } from '../store/storage.js';
import ProductionTimeline from '../components/ProductionTimeline.jsx';
import ActiveOperationPanel from '../components/ActiveOperationPanel.jsx';
import CreditBudget from '../components/CreditBudget.jsx';

export default function ProductionView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [mode, setMode] = useState('auteur'); // 'manual' | 'auteur'
  const [sessionState, setSessionState] = useState(null);
  const [log, setLog] = useState([]);
  const [started, setStarted] = useState(false);

  const logRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Load project
  useEffect(() => {
    if (!id) return;
    storage.getProject(id).then(setProject);
  }, [id]);

  // SSE connection
  useEffect(() => {
    if (!started || !id) return;

    const es = new EventSource(`/api/auteur/status?projectId=${id}`);
    eventSourceRef.current = es;

    es.addEventListener('state', (e) => {
      try { setSessionState(JSON.parse(e.data)); } catch {}
    });

    es.addEventListener('log', (e) => {
      try {
        const entry = JSON.parse(e.data);
        setLog((prev) => [...prev, entry]);
      } catch {}
    });

    es.addEventListener('complete', () => {
      // Session done
    });

    es.addEventListener('pipeline', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLog((prev) => [...prev, {
          timestamp: new Date().toISOString(),
          message: `Pipeline: ${data.stage}${data.data ? ' complete' : '...'}`,
          type: 'pipeline',
        }]);
      } catch {}
    });

    es.addEventListener('evaluation', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLog((prev) => [...prev, {
          timestamp: new Date().toISOString(),
          message: `Shot ${data.shotIndex + 1}: ${data.score}/100 — ${data.assessment}`,
          type: 'evaluation',
        }]);
      } catch {}
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [started, id]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // Start session
  const handleStart = useCallback(async () => {
    if (!project) return;

    const latestRun = project.runs?.[project.runs.length - 1];
    if (!latestRun) {
      alert('No pipeline run found. Run the pipeline first.');
      return;
    }

    try {
      const res = await fetch('/api/auteur/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          runId: latestRun.id,
          mode,
          settings: {
            draft: true,
            autoApproveThreshold: 80,
            maxRetries: 3,
          },
        }),
      });

      if (res.ok) {
        setStarted(true);
        setLog([{ timestamp: new Date().toISOString(), message: `${mode.toUpperCase()} session started`, type: 'info' }]);
      } else {
        const err = await res.json();
        alert(`Failed to start: ${err.error}`);
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  }, [project, mode]);

  // Respond to check-in
  const handleRespond = useCallback(async (response) => {
    if (!id) return;
    await fetch('/api/auteur/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id, response }),
    });
  }, [id]);

  // Controls
  const handlePause = () => fetch('/api/auteur/pause', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: id }),
  });

  const handleResume = () => fetch('/api/auteur/resume', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: id }),
  });

  const handleAbort = () => {
    if (confirm('Abort production session?')) {
      fetch('/api/auteur/abort', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      });
    }
  };

  if (!project) {
    return <div style={styles.loading}>Loading project...</div>;
  }

  // ── Pre-start: mode selection ─────────────────────────────────────────────
  if (!started) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <button onClick={() => navigate(`/projects/${id}`)} style={S.btnSec}>
            BACK
          </button>
          <h1 style={styles.title}>PRODUCE</h1>
          <div />
        </div>

        <div style={styles.modeSelect}>
          <div style={styles.modeLabel}>PRODUCTION MODE</div>

          <div style={styles.modeCards}>
            <button
              onClick={() => setMode('manual')}
              style={{
                ...styles.modeCard,
                borderColor: mode === 'manual' ? COLORS.borderActive : COLORS.border,
                background: mode === 'manual' ? COLORS.surfaceActive : COLORS.surface,
              }}
            >
              <div style={styles.modeTitle}>MANUAL</div>
              <div style={styles.modeDesc}>
                Pipeline creates shot plan + keyframe prompts.
                You operate Dream Machine yourself.
              </div>
              <div style={styles.modeCost}>0 credits (platform costs separate)</div>
            </button>

            <button
              onClick={() => setMode('auteur')}
              style={{
                ...styles.modeCard,
                borderColor: mode === 'auteur' ? COLORS.borderActive : COLORS.border,
                background: mode === 'auteur' ? COLORS.surfaceActive : COLORS.surface,
              }}
            >
              <div style={styles.modeTitle}>AUTEUR</div>
              <div style={styles.modeDesc}>
                Playwright drives Dream Machine end-to-end.
                Full automation — concept to finished ad.
              </div>
              <div style={styles.modeCost}>~624 credits (Draft tier, 3 shots)</div>
            </button>
          </div>

          <button onClick={handleStart} style={{ ...S.btnPrimary, maxWidth: '400px', margin: '24px auto' }}>
            START {mode.toUpperCase()} PRODUCTION
          </button>
        </div>
      </div>
    );
  }

  // ── Active session ────────────────────────────────────────────────────────
  const ss = sessionState || {};

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={() => navigate(`/projects/${id}`)} style={S.btnSec}>
            BACK
          </button>
          <h1 style={styles.title}>
            {mode.toUpperCase()} — {ss.state?.toUpperCase() || 'STARTING'}
          </h1>
        </div>

        <div style={styles.headerRight}>
          <CreditBudget creditsUsed={ss.creditsUsed} mode={mode} />

          <div style={styles.controls}>
            {ss.paused ? (
              <button onClick={handleResume} style={{ ...S.btnSec, borderColor: '#5a9a6a', color: '#5a9a6a' }}>
                RESUME
              </button>
            ) : (
              <button onClick={handlePause} style={S.btnSec}>PAUSE</button>
            )}
            <button onClick={handleAbort} style={{ ...S.btnSec, borderColor: '#c0564a', color: '#c0564a' }}>
              ABORT
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={styles.section}>
        <ProductionTimeline
          shotPlan={ss.shotPlan || []}
          generations={ss.generations || {}}
          keyframes={ss.keyframes || {}}
          chainedIds={{}}
          currentShot={null}
        />
      </div>

      {/* Active operation + check-in */}
      <div style={styles.section}>
        <ActiveOperationPanel
          state={ss.state}
          substate={ss.substate}
          checkIn={ss.checkIn}
          onRespond={handleRespond}
        />
      </div>

      {/* Operation log */}
      <div style={styles.section}>
        <div style={styles.logLabel}>OPERATION LOG</div>
        <div ref={logRef} style={styles.logContainer}>
          {log.map((entry, i) => (
            <div key={i} style={{
              ...styles.logEntry,
              color: entry.type === 'error' ? '#c0564a'
                : entry.type === 'check-in' ? '#b89c4a'
                : entry.type === 'human' ? '#5a9a6a'
                : entry.type === 'evaluation' ? COLORS.text
                : COLORS.textDim,
            }}>
              <span style={styles.logTime}>
                {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span>{entry.message}</span>
            </div>
          ))}
          {log.length === 0 && (
            <div style={{ color: COLORS.textDim, fontStyle: 'italic' }}>
              Waiting for events...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: '24px 32px',
    maxWidth: '1100px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  loading: {
    padding: '40px',
    color: COLORS.textDim,
    fontFamily: FONTS.mono,
    fontSize: '11px',
    textAlign: 'center',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  title: {
    fontFamily: FONTS.mono,
    fontSize: '14px',
    letterSpacing: '4px',
    color: COLORS.text,
    fontWeight: 400,
  },
  controls: {
    display: 'flex',
    gap: '8px',
  },
  section: {
    width: '100%',
  },

  // Mode selection
  modeSelect: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    marginTop: '60px',
  },
  modeLabel: {
    fontFamily: FONTS.mono,
    fontSize: '9px',
    letterSpacing: '3px',
    color: COLORS.textDim,
  },
  modeCards: {
    display: 'flex',
    gap: '16px',
    maxWidth: '700px',
  },
  modeCard: {
    flex: 1,
    padding: '24px',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '6px',
    background: COLORS.surface,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    transition: 'border-color 0.2s, background 0.2s',
    fontFamily: FONTS.mono,
    color: COLORS.text,
  },
  modeTitle: {
    fontSize: '13px',
    letterSpacing: '3px',
    fontWeight: 500,
  },
  modeDesc: {
    fontSize: '10px',
    color: COLORS.textMid,
    lineHeight: 1.6,
  },
  modeCost: {
    fontSize: '9px',
    color: COLORS.textDim,
    marginTop: 'auto',
  },

  // Log
  logLabel: {
    fontFamily: FONTS.mono,
    fontSize: '9px',
    letterSpacing: '2.5px',
    color: COLORS.textDim,
    marginBottom: '8px',
  },
  logContainer: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '4px',
    padding: '12px 16px',
    maxHeight: '240px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  logEntry: {
    fontFamily: FONTS.mono,
    fontSize: '10px',
    lineHeight: 1.5,
    display: 'flex',
    gap: '10px',
  },
  logTime: {
    color: COLORS.textDim,
    flexShrink: 0,
    fontSize: '9px',
  },
};
