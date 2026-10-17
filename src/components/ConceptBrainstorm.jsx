/**
 * CONCEPT BRAINSTORM PANEL
 *
 * Sprint 04B: Embodied Auteur Agent
 *
 * Collapsible inline panel between CreativeDirection and concept textarea.
 * The auteur embodies the user's vision (free text) from latent space,
 * reads the raw concept, and proposes a Luma-optimized version.
 *
 * LUMA BRAIN flow (when enabled): generates a T2V draft, sends to
 * platform brainstorm, interprets results through the embodied vision.
 */

import { useState, useRef, useEffect } from 'react';
import { S } from '../styles/theme.js';
import {
  embodyAndPropose,
  respondToFeedback,
  interpretPlatformBrainstorm,
} from '../lib/concept-brainstorm.js';
import { createDialogueTurn } from '../lib/auteur-dialogue.js';
import {
  submitDraft,
  pollGeneration,
  callPlatformBrainstorm,
  checkPlatformSession,
  openPlatformLogin,
} from '../lib/luma-client.js';

export default function ConceptBrainstorm({ concept, settings, onUpdateSettings, onAcceptConcept }) {
  const [active, setActive] = useState(false);
  const [turns, setTurns] = useState([]);
  const [phase, setPhase] = useState('idle');
  const [feedbackText, setFeedbackText] = useState('');
  const [draftGeneration, setDraftGeneration] = useState(null);
  const [platformLoggedIn, setPlatformLoggedIn] = useState(null);
  const scrollRef = useRef(null);
  const panelRef = useRef(null);

  const lumaBrain = settings?.lumaBrain || false;

  // Auto-scroll turns list on new turns
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  // Scroll panel into view when it opens or gets new content
  useEffect(() => {
    if (active && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [active, turns]);

  const creativeDirection = {
    mood: settings?.mood || 'neutral',
    energy: settings?.energy || 'building',
    vision: settings?.vision || '',
  };

  // ─── Initiate brainstorm ───────────────────────────────────────────────────

  const handleOpen = async () => {
    setActive(true);
    if (turns.length > 0 || !concept.trim()) return;
    await runProposal();
  };

  const runProposal = async () => {
    setPhase('proposing');
    try {
      const result = await embodyAndPropose(concept, creativeDirection);
      const turn = createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: result.message,
        prompt: result.refinedConcept,
      });
      setTurns((prev) => [...prev, turn]);

      // If LUMA BRAIN is on, continue to draft generation
      if (lumaBrain) {
        await runLumaBrainFlow(result.refinedConcept);
      } else {
        setPhase('complete');
      }
    } catch (e) {
      const errorTurn = createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: `Error: ${e.message}`,
      });
      setTurns((prev) => [...prev, errorTurn]);
      setPhase('idle');
    }
  };

  // ─── LUMA BRAIN flow ───────────────────────────────────────────────────────

  const runLumaBrainFlow = async (optimizedPrompt) => {
    // Check platform session first
    setPhase('generating-draft');
    try {
      const session = await checkPlatformSession();
      setPlatformLoggedIn(session.loggedIn);
      if (!session.loggedIn) {
        const sessionTurn = createDialogueTurn({
          role: 'auteur',
          type: 'proposal',
          message: 'Platform session required for LUMA BRAIN. Please log in to continue.',
        });
        setTurns((prev) => [...prev, sessionTurn]);
        setPhase('complete');
        return;
      }
    } catch {
      setPlatformLoggedIn(false);
      const sessionTurn = createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: 'Could not check platform session. LUMA BRAIN flow skipped.',
      });
      setTurns((prev) => [...prev, sessionTurn]);
      setPhase('complete');
      return;
    }

    // Generate draft
    const draftTurn = createDialogueTurn({
      role: 'auteur',
      type: 'proposal',
      message: 'Generating concept draft for Luma brainstorm (~40 credits)...',
    });
    setTurns((prev) => [...prev, draftTurn]);

    try {
      const draft = await submitDraft({
        prompt: optimizedPrompt,
        model: 'Ray3.14',
        duration: '5s',
        aspect: '16:9',
        enhance: true,
      });
      setDraftGeneration({ id: draft.id, state: 'queued' });

      // Poll until complete
      setPhase('polling-draft');
      let gen = draft;
      while (gen.state !== 'completed' && gen.state !== 'failed') {
        await new Promise((r) => setTimeout(r, 5000));
        gen = await pollGeneration(draft.id);
        setDraftGeneration({ id: draft.id, state: gen.state, videoUrl: gen.assets?.video });
      }

      if (gen.state === 'failed') {
        const failTurn = createDialogueTurn({
          role: 'auteur',
          type: 'proposal',
          message: 'Draft generation failed. Proceeding without LUMA BRAIN.',
        });
        setTurns((prev) => [...prev, failTurn]);
        setPhase('complete');
        return;
      }

      // Call platform brainstorm
      setPhase('brainstorming');
      const completeTurn = createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: 'Draft complete. Consulting Luma brainstorm...',
      });
      setTurns((prev) => [...prev, completeTurn]);

      const brainstormResults = await callPlatformBrainstorm(draft.id);

      // Interpret through embodied vision
      setPhase('interpreting');
      const interpretations = await interpretPlatformBrainstorm(
        brainstormResults, optimizedPrompt, creativeDirection
      );

      const interpTurn = createDialogueTurn({
        role: 'auteur',
        type: 'alternatives',
        message: interpretations.message,
        variations: interpretations.interpretations.map((i) => ({
          theme: i.theme,
          direction: i.rationale,
          prompt: i.refinedConcept,
        })),
      });
      setTurns((prev) => [...prev, interpTurn]);
      setPhase('complete');
    } catch (e) {
      const errorTurn = createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: `LUMA BRAIN error: ${e.message}. You can still accept the refined concept above.`,
      });
      setTurns((prev) => [...prev, errorTurn]);
      setPhase('complete');
    }
  };

  // ─── Human feedback ────────────────────────────────────────────────────────

  const handleSendFeedback = async () => {
    const text = feedbackText.trim();
    if (!text || phase === 'proposing') return;

    const humanTurn = createDialogueTurn({
      role: 'human',
      type: 'feedback',
      message: text,
    });
    setTurns((prev) => [...prev, humanTurn]);
    setFeedbackText('');

    setPhase('proposing');
    try {
      const result = await respondToFeedback(
        [...turns, humanTurn], text, creativeDirection
      );
      const turn = createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: result.message,
        prompt: result.refinedConcept,
      });
      setTurns((prev) => [...prev, turn]);
      setPhase('complete');
    } catch (e) {
      const errorTurn = createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: `Error: ${e.message}`,
      });
      setTurns((prev) => [...prev, errorTurn]);
      setPhase('idle');
    }
  };

  // ─── Accept ────────────────────────────────────────────────────────────────

  const handleAccept = (text) => {
    onAcceptConcept(text);
  };

  // ─── Apply suggestion chip ─────────────────────────────────────────────────

  const handleSuggestion = (key, value) => {
    if (!value || !onUpdateSettings) return;
    onUpdateSettings({ ...settings, [key]: value });
  };

  // ─── Select interpretation ─────────────────────────────────────────────────

  const handleSelectInterpretation = (variation) => {
    if (variation.prompt) {
      const selectTurn = createDialogueTurn({
        role: 'human',
        type: 'feedback',
        message: `Selected: ${variation.theme}`,
      });
      const confirmTurn = createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: `Applied "${variation.theme}" direction.`,
        prompt: variation.prompt,
      });
      setTurns((prev) => [...prev, selectTurn, confirmTurn]);
    }
  };

  // ─── Platform login ─────────────────────────────────────────────────────────

  const handleLogin = async () => {
    try {
      await openPlatformLogin();
      const session = await checkPlatformSession();
      setPlatformLoggedIn(session.loggedIn);
    } catch {
      setPlatformLoggedIn(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!active) {
    return (
      <div style={{
        marginBottom: '12px',
        padding: '10px 0',
        borderTop: '1px solid rgba(232,228,222,0.04)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <button
          onClick={handleOpen}
          disabled={!concept.trim()}
          style={{
            ...S.btnSec,
            fontSize: '10px',
            letterSpacing: '2px',
            padding: '8px 24px',
            color: '#b89c4a',
            borderColor: 'rgba(184,156,74,0.25)',
            background: 'rgba(184,156,74,0.04)',
          }}
        >
          BRAINSTORM
        </button>
        <span style={{
          ...S.mono,
          fontSize: '9px',
          color: 'rgba(232,228,222,0.2)',
        }}>
          {settings?.vision
            ? `auteur embodies "${settings.vision}" and optimizes for Luma`
            : 'auteur reads your concept and optimizes for Luma'}
        </span>
      </div>
    );
  }

  const latestProposal = [...turns].reverse().find((t) => t.role === 'auteur' && t.prompt);
  const latestSuggestions = [...turns].reverse().find((t) => t.role === 'auteur' && t.prompt)
    ? null : null; // suggestions come from the proposal result, handled inline
  const isLoading = phase === 'proposing' || phase === 'generating-draft' ||
    phase === 'polling-draft' || phase === 'brainstorming' || phase === 'interpreting';

  return (
    <div ref={panelRef} style={{
      marginBottom: '16px',
      padding: '14px 16px',
      background: 'rgba(0,0,0,0.25)',
      borderRadius: '3px',
      border: '1px solid rgba(232,228,222,0.06)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
      }}>
        <div style={{
          ...S.mono,
          fontSize: '10px',
          letterSpacing: '2px',
          color: 'rgba(232,228,222,0.35)',
        }}>
          CONCEPT BRAINSTORM
        </div>
        <button
          onClick={() => setActive(false)}
          style={{
            ...S.btnSec,
            fontSize: '8px',
            padding: '2px 8px',
            color: 'rgba(232,228,222,0.25)',
          }}
        >
          CLOSE
        </button>
      </div>

      {/* Vision indicator */}
      {settings?.vision && (
        <div style={{
          ...S.mono,
          fontSize: '8px',
          color: '#b89c4a',
          marginBottom: '8px',
        }}>
          vision: {settings.vision}
        </div>
      )}

      {/* Turns */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: '400px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        {turns.map((turn) => (
          <div key={turn.id} style={{
            padding: '8px 10px',
            background: turn.role === 'auteur' ? 'rgba(184,156,74,0.04)' : 'rgba(232,228,222,0.02)',
            borderRadius: '2px',
            borderLeft: `2px solid ${turn.role === 'auteur' ? 'rgba(184,156,74,0.2)' : 'rgba(232,228,222,0.08)'}`,
          }}>
            <div style={{
              ...S.mono,
              fontSize: '8px',
              letterSpacing: '1px',
              marginBottom: '4px',
              color: turn.role === 'auteur' ? '#b89c4a' : 'rgba(232,228,222,0.5)',
            }}>
              {turn.role === 'auteur' ? 'AUTEUR' : 'YOU'}
            </div>
            <div style={{
              ...S.mono,
              fontSize: '11px',
              color: 'rgba(232,228,222,0.7)',
              lineHeight: '1.6',
            }}>
              {turn.message}
            </div>

            {/* Refined concept */}
            {turn.prompt && (
              <div style={{
                marginTop: '8px',
                padding: '8px 10px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '2px',
                border: '1px solid rgba(232,228,222,0.04)',
              }}>
                <div style={{
                  ...S.mono,
                  fontSize: '8px',
                  color: 'rgba(232,228,222,0.25)',
                  letterSpacing: '1px',
                  marginBottom: '4px',
                }}>
                  REFINED CONCEPT
                </div>
                <div style={{
                  ...S.mono,
                  fontSize: '11px',
                  color: '#e8e4de',
                  lineHeight: '1.6',
                }}>
                  {turn.prompt}
                </div>
              </div>
            )}

            {/* Interpretation variations (LUMA BRAIN) */}
            {turn.variations && turn.variations.length > 0 && (
              <div style={{
                marginTop: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                {turn.variations.map((v, vi) => (
                  <div key={vi} style={{
                    padding: '8px 10px',
                    background: 'rgba(106,138,184,0.04)',
                    borderRadius: '2px',
                    border: '1px solid rgba(106,138,184,0.1)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ ...S.mono, fontSize: '9px', color: '#6a8ab8', letterSpacing: '1px' }}>
                        {v.theme}
                      </div>
                      <button
                        onClick={() => handleSelectInterpretation(v)}
                        style={{
                          ...S.btnSec,
                          fontSize: '8px',
                          padding: '2px 10px',
                          color: '#6a8ab8',
                          borderColor: 'rgba(106,138,184,0.2)',
                        }}
                      >
                        SELECT
                      </button>
                    </div>
                    {v.direction && (
                      <div style={{ ...S.mono, fontSize: '9px', color: 'rgba(232,228,222,0.4)', marginTop: '3px' }}>
                        {v.direction}
                      </div>
                    )}
                    {v.prompt && (
                      <div style={{ ...S.mono, fontSize: '10px', color: 'rgba(232,228,222,0.6)', marginTop: '4px' }}>
                        "{v.prompt}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Accept button on latest proposal */}
            {turn.role === 'auteur' && turn.prompt && turn === turns[turns.length - 1] && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button
                  onClick={() => handleAccept(turn.prompt)}
                  style={{
                    ...S.btnSec,
                    fontSize: '9px',
                    padding: '5px 16px',
                    letterSpacing: '1px',
                    color: '#5a9a6a',
                    borderColor: 'rgba(90,154,106,0.3)',
                  }}
                >
                  ACCEPT
                </button>
                <button
                  onClick={runProposal}
                  disabled={isLoading}
                  style={{
                    ...S.btnSec,
                    fontSize: '9px',
                    padding: '5px 14px',
                    letterSpacing: '1px',
                    color: 'rgba(232,228,222,0.4)',
                  }}
                >
                  ALTERNATIVES
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div style={{
            ...S.mono,
            fontSize: '9px',
            color: '#b89c4a',
            padding: '6px 10px',
            animation: 'pulse 1.5s infinite',
          }}>
            {phase === 'proposing' && 'auteur thinking...'}
            {phase === 'generating-draft' && 'generating concept draft...'}
            {phase === 'polling-draft' && `draft ${draftGeneration?.state || 'processing'}...`}
            {phase === 'brainstorming' && 'consulting Luma brainstorm...'}
            {phase === 'interpreting' && 'interpreting through vision...'}
          </div>
        )}

        {/* Platform login prompt */}
        {platformLoggedIn === false && lumaBrain && (
          <div style={{
            padding: '8px 10px',
            background: 'rgba(106,138,184,0.04)',
            borderRadius: '2px',
            border: '1px solid rgba(106,138,184,0.1)',
          }}>
            <button
              onClick={handleLogin}
              style={{
                ...S.btnSec,
                fontSize: '9px',
                padding: '5px 16px',
                color: '#6a8ab8',
                borderColor: 'rgba(106,138,184,0.3)',
              }}
            >
              LOG IN TO DREAM MACHINE
            </button>
          </div>
        )}
      </div>

      {/* Draft video preview */}
      {draftGeneration?.videoUrl && (
        <div style={{ marginBottom: '8px' }}>
          <video
            src={draftGeneration.videoUrl}
            autoPlay muted loop playsInline
            style={{
              width: '100%',
              maxWidth: '300px',
              borderRadius: '2px',
              opacity: 0.7,
            }}
          />
        </div>
      )}

      {/* Input bar */}
      <div style={{
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        borderTop: '1px solid rgba(232,228,222,0.05)',
        paddingTop: '8px',
      }}>
        <input
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendFeedback();
            }
          }}
          disabled={isLoading}
          placeholder="steer the vision..."
          style={{
            ...S.input,
            flex: 1,
            fontSize: '11px',
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.02)',
          }}
        />
        <button
          onClick={handleSendFeedback}
          disabled={!feedbackText.trim() || isLoading}
          style={{
            ...S.btnSec,
            fontSize: '11px',
            padding: '6px 12px',
            color: feedbackText.trim() ? 'rgba(232,228,222,0.6)' : 'rgba(232,228,222,0.15)',
          }}
        >
          {'\u2192'}
        </button>
      </div>
    </div>
  );
}
