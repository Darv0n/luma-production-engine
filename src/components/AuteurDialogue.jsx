/**
 * AUTEUR DIALOGUE
 *
 * Sprint 04: Per-shot conversational auteur.
 * Chat-like interface where human and auteur curate each keyframe together.
 * Each approved shot builds context for the next.
 *
 * Replaces the brainstorm panel in SchemaOutput.
 */

import { useState, useRef, useEffect } from 'react';
import { S } from '../styles/theme.js';
import {
  generateInitialProposal,
  respondToFeedback,
  requestAlternatives,
  createDialogueTurn,
  createShotDialogue,
} from '../lib/auteur-dialogue.js';
import { callAPI } from '../lib/api.js';

export default function AuteurDialogue({
  shot,
  shotIndex,
  arcData,
  concept,
  creativeDirection,
  approvedShots,
  dialogue,
  onApprove,
  onUpdateShot,
  onDialogueUpdate,
  onGenerateKeyframe,
}) {
  const [loading, setLoading] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const scrollRef = useRef(null);

  // Auto-scroll on new turns
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [dialogue?.turns?.length]);

  // Auto-generate initial proposal when dialogue opens with no turns
  useEffect(() => {
    if (dialogue?.state === 'active' && dialogue.turns.length === 0 && !loading) {
      handleInitialProposal();
    }
  }, [dialogue?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateDialogue = (patch) => {
    const updated = { ...dialogue, ...patch };
    onDialogueUpdate(shotIndex, updated);
    return updated;
  };

  const addTurn = (turn) => {
    const updated = updateDialogue({ turns: [...dialogue.turns, turn] });
    return updated;
  };

  const handleInitialProposal = async () => {
    setLoading(true);
    try {
      const result = await generateInitialProposal(
        shot, arcData, concept, creativeDirection, approvedShots, callAPI
      );
      addTurn(createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: result.message,
        prompt: result.prompt,
        settings: result.settings,
      }));
    } catch (e) {
      addTurn(createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: `Failed to generate proposal: ${e.message}`,
      }));
    }
    setLoading(false);
  };

  const handleSendFeedback = async () => {
    const text = feedbackText.trim();
    if (!text || loading) return;
    setFeedbackText('');

    addTurn(createDialogueTurn({
      role: 'human',
      type: 'feedback',
      message: text,
    }));

    setLoading(true);
    try {
      const currentDialogue = { ...dialogue, turns: [...dialogue.turns, createDialogueTurn({ role: 'human', type: 'feedback', message: text })] };
      const result = await respondToFeedback(
        currentDialogue, text, arcData, concept, creativeDirection, approvedShots, callAPI
      );
      addTurn(createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: result.message,
        prompt: result.prompt,
        settings: result.settings,
      }));
    } catch (e) {
      addTurn(createDialogueTurn({
        role: 'auteur',
        type: 'proposal',
        message: `Refinement failed: ${e.message}`,
      }));
    }
    setLoading(false);
  };

  const handleRequestAlternatives = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await requestAlternatives(
        dialogue, arcData, concept, creativeDirection, approvedShots, callAPI
      );
      addTurn(createDialogueTurn({
        role: 'auteur',
        type: 'alternatives',
        message: result.message,
        variations: result.alternatives,
      }));
    } catch (e) {
      addTurn(createDialogueTurn({
        role: 'auteur',
        type: 'alternatives',
        message: `Alternatives failed: ${e.message}`,
      }));
    }
    setLoading(false);
  };

  const handleApprove = (turn) => {
    const approvedPrompt = turn.prompt;
    const approvedSettings = turn.settings || {};

    addTurn(createDialogueTurn({
      role: 'human',
      type: 'approval',
      message: 'Approved.',
      approved: true,
    }));

    updateDialogue({
      state: 'approved',
      approvedPrompt,
      approvedSettings,
      turns: [...dialogue.turns, createDialogueTurn({ role: 'human', type: 'approval', message: 'Approved.', approved: true })],
    });

    if (onApprove) {
      onApprove(shotIndex, approvedPrompt, approvedSettings);
    }
  };

  const handleSelectAlternative = (alt) => {
    // Apply alternative as the current proposal
    addTurn(createDialogueTurn({
      role: 'auteur',
      type: 'proposal',
      message: `Going with "${alt.theme}": ${alt.direction}`,
      prompt: alt.prompt,
      settings: alt.settings,
    }));
  };

  const handleGenerateKeyframe = async (prompt) => {
    if (!onGenerateKeyframe || loading) return;
    setLoading(true);
    try {
      const imageUrl = await onGenerateKeyframe(prompt);
      addTurn(createDialogueTurn({
        role: 'auteur',
        type: 'keyframe',
        message: 'Keyframe generated.',
        keyframeUrl: imageUrl,
        prompt,
      }));
    } catch (e) {
      addTurn(createDialogueTurn({
        role: 'auteur',
        type: 'keyframe',
        message: `Keyframe generation failed: ${e.message}`,
      }));
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendFeedback();
    }
  };

  if (!dialogue || dialogue.state === 'pending') return null;

  // Find arc position label
  const beat = arcData?.beats?.[shot.beatIndex ?? shotIndex];
  const pos = beat ? ((beat.position || 0) * 100).toFixed(0) : '?';
  const pivotPos = arcData?.pivotPosition ?? 0.6;
  const p = beat?.position ?? 0;
  let label = 'OPENING';
  if (p <= 0.15) label = 'OPENING';
  else if (p <= 0.35) label = 'TENSION';
  else if (p < pivotPos - 0.05) label = 'FLOOR';
  else if (Math.abs(p - pivotPos) <= 0.12) label = 'PIVOT';
  else if (p <= 0.85) label = 'RESOLUTION';
  else label = 'TERMINAL';

  const isApproved = dialogue.state === 'approved';

  return (
    <div style={{
      marginTop: '8px',
      border: `1px solid ${isApproved ? 'rgba(90,154,106,0.2)' : 'rgba(184,156,74,0.2)'}`,
      borderRadius: '3px',
      background: isApproved ? 'rgba(90,154,106,0.03)' : 'rgba(184,156,74,0.03)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid rgba(232,228,222,0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ ...S.mono, fontSize: '10px', letterSpacing: '2px', color: isApproved ? '#5a9a6a' : '#b89c4a' }}>
            {isApproved ? 'APPROVED' : 'AUTEUR DIALOGUE'}
          </span>
          <span style={{ ...S.mono, fontSize: '10px', color: 'rgba(232,228,222,0.3)' }}>
            Shot {shotIndex + 1}: "{shot.name}"
          </span>
        </div>
        <span style={{ ...S.mono, fontSize: '9px', color: 'rgba(232,228,222,0.25)' }}>
          {label} {pos}%
        </span>
      </div>

      {/* Dialogue turns */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: '400px',
          overflowY: 'auto',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {dialogue.turns.map((turn) => (
          <div key={turn.id}>
            {/* Role label */}
            <div style={{
              ...S.mono, fontSize: '9px', letterSpacing: '1.5px',
              color: turn.role === 'auteur' ? '#b89c4a' : 'rgba(232,228,222,0.5)',
              marginBottom: '4px',
            }}>
              {turn.role === 'auteur' ? 'AUTEUR' : 'YOU'}
            </div>

            {/* Message */}
            <div style={{
              ...S.mono, fontSize: '11px', color: 'rgba(232,228,222,0.6)',
              lineHeight: '1.6', marginBottom: turn.prompt || turn.variations ? '6px' : 0,
            }}>
              {turn.message}
            </div>

            {/* Prompt proposal */}
            {turn.prompt && (
              <div style={{
                padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px',
                marginBottom: '6px',
              }}>
                <div style={{ ...S.mono, fontSize: '9px', color: 'rgba(232,228,222,0.3)', letterSpacing: '1px', marginBottom: '4px' }}>
                  PROMPT
                </div>
                <div style={{ ...S.mono, fontSize: '11px', color: '#e8e4de', lineHeight: '1.5' }}>
                  "{turn.prompt}"
                </div>
              </div>
            )}

            {/* Settings */}
            {turn.settings && (turn.settings.cameraControl || turn.settings.dynamicRange !== 'standard') && (
              <div style={{ ...S.mono, fontSize: '10px', color: 'rgba(232,228,222,0.35)', marginBottom: '6px' }}>
                SETTINGS: {[
                  turn.settings.cameraControl,
                  turn.settings.dynamicRange !== 'standard' && turn.settings.dynamicRange?.toUpperCase(),
                  turn.settings.duration,
                ].filter(Boolean).join(' | ')}
              </div>
            )}

            {/* Keyframe image */}
            {turn.keyframeUrl && (
              <img
                src={turn.keyframeUrl}
                alt="Keyframe"
                style={{
                  width: '100%', maxWidth: '400px', borderRadius: '3px',
                  border: '1px solid rgba(232,228,222,0.1)', marginBottom: '6px',
                }}
              />
            )}

            {/* Alternatives */}
            {turn.variations && turn.variations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                {turn.variations.map((alt, ai) => (
                  <div key={ai} style={{
                    padding: '8px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: '3px',
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...S.mono, fontSize: '10px', color: '#e8e4de', marginBottom: '2px' }}>{alt.theme}</div>
                      <div style={{ ...S.mono, fontSize: '10px', color: 'rgba(232,228,222,0.35)' }}>{alt.direction}</div>
                      <div style={{ ...S.mono, fontSize: '10px', color: 'rgba(232,228,222,0.5)', fontStyle: 'italic', marginTop: '2px' }}>
                        "{alt.prompt}"
                      </div>
                    </div>
                    {!isApproved && (
                      <button
                        onClick={() => handleSelectAlternative(alt)}
                        style={{ ...S.btnSec, padding: '4px 10px', fontSize: '9px', flexShrink: 0 }}
                      >
                        SELECT
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons on auteur proposals (only on latest unapproved) */}
            {turn.role === 'auteur' && turn.prompt && !isApproved && turn === dialogue.turns[dialogue.turns.length - 1] && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <button
                  onClick={() => handleApprove(turn)}
                  style={{
                    ...S.btnSec, padding: '5px 14px', fontSize: '9px',
                    color: '#5a9a6a', borderColor: 'rgba(90,154,106,0.3)',
                    background: 'rgba(90,154,106,0.06)',
                  }}
                >
                  APPROVE
                </button>
                <button
                  onClick={handleRequestAlternatives}
                  disabled={loading}
                  style={{ ...S.btnSec, padding: '5px 14px', fontSize: '9px' }}
                >
                  ALTERNATIVES
                </button>
                {onGenerateKeyframe && (
                  <button
                    onClick={() => handleGenerateKeyframe(turn.prompt)}
                    disabled={loading}
                    style={{
                      ...S.btnSec, padding: '5px 14px', fontSize: '9px',
                      color: '#6a8ab8', borderColor: 'rgba(106,138,184,0.3)',
                    }}
                  >
                    GENERATE KEYFRAME
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{
            ...S.mono, fontSize: '10px', color: '#b89c4a',
            animation: 'pulse 1.5s infinite',
          }}>
            auteur thinking...
          </div>
        )}
      </div>

      {/* Input bar — only when dialogue is active */}
      {!isApproved && (
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid rgba(232,228,222,0.06)',
          display: 'flex',
          gap: '8px',
        }}>
          <input
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type feedback or direction..."
            disabled={loading}
            style={{
              ...S.input,
              flex: 1,
              fontSize: '11px',
              padding: '6px 10px',
              border: 'none',
              background: 'rgba(0,0,0,0.2)',
            }}
          />
          <button
            onClick={handleSendFeedback}
            disabled={!feedbackText.trim() || loading}
            style={{
              ...S.btnSec,
              padding: '6px 14px',
              fontSize: '10px',
              color: feedbackText.trim() ? '#e8e4de' : 'rgba(232,228,222,0.2)',
            }}
          >
            {'\u2192'}
          </button>
        </div>
      )}
    </div>
  );
}
