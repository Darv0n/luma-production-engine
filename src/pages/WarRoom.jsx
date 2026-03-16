/**
 * WAR ROOM
 *
 * Three-Mind Creative Command Center.
 * Route: /projects/:id/war-room
 *
 * Three-panel layout:
 * - DIALOGUE (60%) — three-way conversation (Claude + Gemini + Human)
 * - CANVAS (25%) — live Luma platform screenshot feed
 * - ASSETS (15%) — thumbnail grid of generated/captured assets
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { S, COLORS, FONTS } from '../styles/theme.js';
import { storage } from '../store/storage.js';
import WarRoomMessage from '../components/WarRoomMessage.jsx';
import {
  startWarRoom,
  sendMessage,
  connectPlatform,
  generateKeyframe,
  pushToPlatform,
  platformPrompt,
  takeScreenshot,
  pauseWarRoom,
  resumeWarRoom,
  abortWarRoom,
  traverseWithGemini,
  runProduction,
} from '../lib/war-room-client.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const VOICE_COLORS = {
  claude: '#b89c4a',
  gemini: '#6a8ab8',
  human:  '#5a9a6a',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function WarRoom() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();

  // State
  const [project, setProject] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [dialogue, setDialogue] = useState([]);
  const [assets, setAssets] = useState([]);
  const [input, setInput] = useState('');
  const [canvasImage, setCanvasImage] = useState(null);
  const [started, setStarted] = useState(false);
  const [assetFilter, setAssetFilter] = useState('all');
  const [expandedAsset, setExpandedAsset] = useState(null);

  // Refs
  const dialogueEndRef = useRef(null);
  const inputRef = useRef(null);
  const sseRef = useRef(null);
  const canvasSSERef = useRef(null);

  // Load project
  useEffect(() => {
    if (!projectId) return;
    storage.getProject(projectId).then(p => setProject(p));
  }, [projectId]);

  // SSE: War Room events
  useEffect(() => {
    if (!started || !projectId) return;

    const es = new EventSource(`/api/war-room/status?projectId=${projectId}`);
    sseRef.current = es;

    es.addEventListener('state', (e) => {
      setSessionState(JSON.parse(e.data));
    });

    es.addEventListener('dialogue', (e) => {
      const turn = JSON.parse(e.data);
      setDialogue(prev => [...prev, turn]);
    });

    es.addEventListener('asset', (e) => {
      const asset = JSON.parse(e.data);
      setAssets(prev => [...prev, asset]);
    });

    es.onerror = () => {
      // Reconnect on error
    };

    return () => es.close();
  }, [started, projectId]);

  // SSE: Canvas stream (Phase 2)
  useEffect(() => {
    if (!sessionState?.platformConnected || !sessionState?.boardId) return;

    const es = new EventSource(
      `/api/realms/canvas-stream?boardId=${sessionState.boardId}`
    );
    canvasSSERef.current = es;

    es.addEventListener('frame', (e) => {
      const { imageBase64 } = JSON.parse(e.data);
      setCanvasImage(imageBase64);
    });

    return () => es.close();
  }, [sessionState?.platformConnected, sessionState?.boardId]);

  // Auto-scroll dialogue
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dialogue]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    await startWarRoom(projectId);
    setStarted(true);
  }, [projectId]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessage(projectId, text);
    inputRef.current?.focus();
  }, [input, projectId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleConnect = useCallback(async () => {
    await connectPlatform(projectId);
  }, [projectId]);

  const handleKeyframe = useCallback(async () => {
    const prompt = window.prompt('Keyframe prompt:');
    if (!prompt) return;
    await generateKeyframe(projectId, prompt);
  }, [projectId]);

  const handleScreenshot = useCallback(async () => {
    await takeScreenshot(projectId);
  }, [projectId]);

  const handlePushToPlatform = useCallback(async (assetId) => {
    await pushToPlatform(projectId, assetId);
  }, [projectId]);

  const handleScout = useCallback(async () => {
    const goal = input.trim() || 'Survey the board. Evaluate what has been generated against the creative vision. Report model choices, prompt quality, and any deviations from the arc.';
    setInput('');
    await traverseWithGemini(projectId, goal);
  }, [input, projectId]);

  const handleRunProduction = useCallback(async () => {
    if (!project) return;
    // Pull shots from the latest run
    const latestRun = project.runs?.[project.runs.length - 1];
    const rawShots = latestRun?.shots || [];
    if (!rawShots.length) {
      alert('No shots found in project. Run the pipeline first.');
      return;
    }
    // Map pipeline shot schema → war room shot format
    const shots = rawShots.map((s, i) => ({
      number: String(i + 1).padStart(2, '0'),
      name: s.name || s.title || `Shot ${i + 1}`,
      prompt: s.prompt || '',
      vision: s.vision?.description || s.prompt || '',
      arcPosition: s.beatIndex !== undefined ? `${Math.round(s.beatIndex * 100 / rawShots.length)}%` : `${Math.round((i / rawShots.length) * 100)}%`,
      keyframePrompt: s.keyframePrompt || s.prompt || '',
    }));
    await runProduction(projectId, shots);
  }, [project, projectId]);

  const handlePause = () => pauseWarRoom(projectId);
  const handleResume = () => resumeWarRoom(projectId);
  const handleAbort = () => {
    if (window.confirm('End War Room session?')) abortWarRoom(projectId);
  };

  // ── Filter assets ───────────────────────────────────────────────────────

  const filteredAssets = assetFilter === 'all'
    ? assets
    : assets.filter(a => a.type === assetFilter);

  // ── Pre-start screen ───────────────────────────────────────────────────

  if (!started) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '24px',
      }}>
        <div style={{
          fontFamily: FONTS.mono,
          fontSize: '10px',
          letterSpacing: '4px',
          color: COLORS.textDim,
          textTransform: 'uppercase',
        }}>
          WAR ROOM
        </div>
        <div style={{
          fontFamily: FONTS.mono,
          fontSize: '12px',
          color: COLORS.textMid,
          textAlign: 'center',
          maxWidth: '400px',
          lineHeight: '1.6',
        }}>
          {project?.name || projectId}
        </div>
        <div style={{
          fontFamily: FONTS.mono,
          fontSize: '9px',
          color: COLORS.textDim,
          textAlign: 'center',
          maxWidth: '400px',
          lineHeight: '1.8',
        }}>
          Three-mind creative command center.
          Claude directs. Gemini counsels. You gate.
          Luma executes.
        </div>
        <button onClick={handleStart} style={{
          ...S.btnPrimary,
          width: 'auto',
          padding: '14px 40px',
          letterSpacing: '3px',
        }}>
          ENTER WAR ROOM
        </button>
        <button onClick={() => navigate(`/projects/${projectId}`)} style={{
          ...S.btnSec,
          fontSize: '9px',
        }}>
          BACK TO PROJECT
        </button>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            style={{ ...S.btnSec, fontSize: '9px', padding: '4px 8px' }}
          >
            BACK
          </button>
          <span style={{
            fontFamily: FONTS.mono,
            fontSize: '9px',
            letterSpacing: '3px',
            color: COLORS.textDim,
          }}>
            WAR ROOM
          </span>
          <span style={{
            fontFamily: FONTS.mono,
            fontSize: '10px',
            color: COLORS.textMid,
          }}>
            {project?.name || projectId}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {!sessionState?.platformConnected && (
            <button onClick={handleConnect} style={{
              ...S.btnSec, fontSize: '8px', padding: '5px 10px',
              borderColor: '#6a8ab833', color: '#6a8ab8',
            }}>
              CONNECT PLATFORM
            </button>
          )}
          {sessionState?.platformConnected && (
            <>
              <span style={{
                fontFamily: FONTS.mono, fontSize: '8px', letterSpacing: '1px',
                color: '#5a9a6a', padding: '5px 10px',
                border: '1px solid rgba(90,154,106,0.2)', borderRadius: '3px',
              }}>
                PLATFORM LIVE
              </span>
              <button onClick={handleRunProduction} style={{
                ...S.btnSec, fontSize: '8px', padding: '5px 12px',
                letterSpacing: '1.5px',
                color: COLORS.claude, borderColor: `${COLORS.claude}44`,
                fontWeight: 'bold',
              }} title="Run full autonomous production: Gemini keyframe rounds + critique + Luma platform submission for all shots">
                ⧑ RUN PRODUCTION
              </button>
            </>
          )}
          {sessionState?.state === 'paused' ? (
            <button onClick={handleResume} style={{
              ...S.btnSec, fontSize: '8px', padding: '5px 10px',
            }}>RESUME</button>
          ) : (
            <button onClick={handlePause} style={{
              ...S.btnSec, fontSize: '8px', padding: '5px 10px',
            }}>PAUSE</button>
          )}
          <button onClick={handleAbort} style={{
            ...S.btnSec, fontSize: '8px', padding: '5px 10px',
            borderColor: 'rgba(192,86,74,0.3)', color: '#c0564a',
          }}>
            END
          </button>
        </div>
      </div>

      {/* Three-panel body */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}>

        {/* DIALOGUE PANEL (60%) */}
        <div style={{
          flex: '0 0 60%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
        }}>
          {/* Dialogue scroll area */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px',
          }}>
            {dialogue.length === 0 && (
              <div style={{
                fontFamily: FONTS.mono,
                fontSize: '9px',
                color: COLORS.textDim,
                textAlign: 'center',
                marginTop: '40px',
              }}>
                Waiting for opening read...
              </div>
            )}
            {dialogue.map(turn => (
              <WarRoomMessage
                key={turn.id}
                turn={turn}
                onPushToPlatform={handlePushToPlatform}
              />
            ))}
            <div ref={dialogueEndRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: '10px 16px',
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
            flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Direct the War Room..."
              rows={1}
              style={{
                ...S.input,
                flex: 1,
                fontSize: '11px',
                padding: '10px 12px',
                resize: 'none',
                minHeight: '40px',
                maxHeight: '120px',
              }}
            />
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button onClick={handleKeyframe} style={{
                ...S.btnSec, fontSize: '7px', padding: '6px 8px',
                letterSpacing: '1px', color: '#b86a8a', borderColor: '#b86a8a33',
              }} title="Generate Nano Banana keyframe">
                KEYFRAME
              </button>
              {sessionState?.platformConnected && (
                <>
                  <button onClick={handleScreenshot} style={{
                    ...S.btnSec, fontSize: '7px', padding: '6px 8px',
                    letterSpacing: '1px', color: '#6a8a8a', borderColor: '#6a8a8a33',
                  }} title="Capture platform screenshot">
                    CAPTURE
                  </button>
                  <button onClick={handleScout} style={{
                    ...S.btnSec, fontSize: '7px', padding: '6px 8px',
                    letterSpacing: '1px', color: COLORS.gemini, borderColor: `${COLORS.gemini}33`,
                  }} title="Send Gemini to visually scout the board (use input as goal, or leave blank for full audit)">
                    SCOUT
                  </button>
                </>
              )}
              <button onClick={handleSend} style={{
                ...S.btnSec, fontSize: '8px', padding: '6px 12px',
                letterSpacing: '1.5px',
                borderColor: COLORS.borderActive,
                color: COLORS.text,
              }}>
                SEND
              </button>
            </div>
          </div>
        </div>

        {/* CANVAS PANEL (25%) */}
        <div style={{
          flex: '0 0 25%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 12px',
            borderBottom: `1px solid ${COLORS.border}`,
          }}>
            <span style={{
              fontFamily: FONTS.mono,
              fontSize: '8px',
              letterSpacing: '2px',
              color: COLORS.textDim,
            }}>
              CANVAS
            </span>
          </div>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            overflow: 'hidden',
          }}>
            {canvasImage ? (
              <img
                src={`data:image/png;base64,${canvasImage}`}
                alt="Platform canvas"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: '3px',
                  border: `1px solid ${COLORS.border}`,
                }}
              />
            ) : (
              <div style={{
                fontFamily: FONTS.mono,
                fontSize: '9px',
                color: COLORS.textDim,
                textAlign: 'center',
                lineHeight: '1.8',
              }}>
                {sessionState?.platformConnected
                  ? 'Waiting for canvas feed...'
                  : 'Connect platform to see live canvas'}
              </div>
            )}
          </div>
        </div>

        {/* ASSETS PANEL (15%) */}
        <div style={{
          flex: '0 0 15%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 12px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{
              fontFamily: FONTS.mono,
              fontSize: '8px',
              letterSpacing: '2px',
              color: COLORS.textDim,
            }}>
              ASSETS ({assets.length})
            </span>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: 'flex',
            padding: '6px 8px',
            gap: '4px',
            borderBottom: `1px solid ${COLORS.border}`,
          }}>
            {['all', 'screenshot', 'keyframe', 'video'].map(f => (
              <button
                key={f}
                onClick={() => setAssetFilter(f)}
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: '7px',
                  letterSpacing: '1px',
                  padding: '2px 5px',
                  border: 'none',
                  background: assetFilter === f ? 'rgba(232,228,222,0.08)' : 'transparent',
                  color: assetFilter === f ? COLORS.textMid : COLORS.textDim,
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Asset grid */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {filteredAssets.length === 0 && (
              <div style={{
                fontFamily: FONTS.mono,
                fontSize: '8px',
                color: COLORS.textDim,
                textAlign: 'center',
                marginTop: '20px',
              }}>
                No assets yet
              </div>
            )}
            {filteredAssets.map(asset => (
              <div
                key={asset.id}
                onClick={() => setExpandedAsset(
                  expandedAsset === asset.id ? null : asset.id
                )}
                style={{
                  cursor: 'pointer',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  border: `1px solid ${COLORS.border}`,
                  transition: 'border-color 0.15s',
                }}
              >
                {asset.imageBase64 && (
                  <img
                    src={`data:image/png;base64,${asset.imageBase64}`}
                    alt={asset.type}
                    style={{
                      width: '100%',
                      height: expandedAsset === asset.id ? 'auto' : '60px',
                      objectFit: expandedAsset === asset.id ? 'contain' : 'cover',
                    }}
                  />
                )}
                <div style={{
                  padding: '4px 6px',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{
                    fontFamily: FONTS.mono,
                    fontSize: '7px',
                    letterSpacing: '1px',
                    color: COLORS.textDim,
                  }}>
                    {asset.type.toUpperCase()} / {asset.source}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
