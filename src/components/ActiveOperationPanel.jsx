/**
 * ACTIVE OPERATION PANEL
 *
 * Context-switching panel that shows details for the current phase.
 * Adapts content based on auteur session state.
 */

import { COLORS, FONTS, S } from '../styles/theme.js';

const PHASE_DESCRIPTIONS = {
  idle: 'Waiting to start...',
  think: 'Running pipeline: SCAN ~ ARC ~ SHOTS ~ VALIDATE',
  design: 'Generating keyframe images for each shot',
  generate: 'Submitting shots to Dream Machine platform',
  chain: 'Chaining shots via Extend Video for seamless transitions',
  polish: 'Applying Upscale+HDR, Audio, and platform polish',
  deliver: 'Downloading finals and assembling video',
  complete: 'Production complete',
  error: 'An error occurred',
  paused: 'Session paused',
};

const SUBSTATE_DESCRIPTIONS = {
  'design.generating': 'Creating start + end frame prompts...',
  'design.reviewing': 'Review keyframe images before generation',
  'design.approved': 'Keyframes approved',
  'generate.submitting': 'Uploading keyframes and submitting...',
  'generate.polling': 'Waiting for generation to complete...',
  'generate.evaluating': 'Evaluating result quality via Claude Vision...',
  'generate.approved': 'Shot approved',
  'generate.retry': 'Regenerating shot...',
  'chain.extracting': 'Extracting last frame for transition...',
  'chain.extending': 'Extending video to chain shots...',
  'chain.evaluating': 'Evaluating chain quality...',
  'polish.upscaling': 'Applying 4K Upscale + HDR...',
  'polish.audio': 'Adding AI-generated audio...',
  'polish.reframe': 'Reframing for target aspect ratio...',
};

export default function ActiveOperationPanel({ state, substate, checkIn, onRespond }) {
  const phaseDesc = PHASE_DESCRIPTIONS[state] || state;
  const substateDesc = substate ? SUBSTATE_DESCRIPTIONS[substate] || substate : null;
  const isWorking = !['idle', 'complete', 'error', 'paused'].includes(state) && !checkIn;

  return (
    <div style={styles.container}>
      {/* Phase header */}
      <div style={styles.phaseRow}>
        <div style={styles.phaseLabel}>{state?.toUpperCase()}</div>
        {isWorking && <div style={styles.spinner} />}
      </div>

      <div style={styles.description}>{phaseDesc}</div>
      {substateDesc && <div style={styles.subDescription}>{substateDesc}</div>}

      {/* Check-in dialogue */}
      {checkIn && (
        <div style={styles.checkInBox}>
          <div style={styles.checkInLabel}>CHECK-IN</div>
          <div style={styles.checkInMessage}>{checkIn.message}</div>

          {checkIn.evaluation && (
            <div style={styles.evalRow}>
              <span style={{
                ...styles.evalScore,
                color: checkIn.evaluation.score >= 80 ? '#5a9a6a'
                  : checkIn.evaluation.score >= 50 ? '#b89c4a' : '#c0564a',
              }}>
                {checkIn.evaluation.score}/100
              </span>
              <span style={styles.evalText}>{checkIn.evaluation.assessment}</span>
            </div>
          )}

          {checkIn.screenshotB64 && (
            <img
              src={`data:image/png;base64,${checkIn.screenshotB64}`}
              alt="Generation result"
              style={styles.screenshot}
            />
          )}

          {checkIn.options && (
            <div style={styles.checkInActions}>
              {checkIn.options.map((choice) => (
                <button
                  key={choice}
                  onClick={() => onRespond?.(choice)}
                  style={{
                    ...S.btnSec,
                    borderColor: choice === 'approve' ? '#5a9a6a'
                      : choice === 'abort' ? '#c0564a'
                      : COLORS.borderActive,
                    color: choice === 'approve' ? '#5a9a6a'
                      : choice === 'abort' ? '#c0564a'
                      : COLORS.text,
                  }}
                >
                  {choice.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Free-form response for non-choice check-ins */}
          {!checkIn.options && (
            <div style={styles.checkInActions}>
              <button
                onClick={() => onRespond?.('approve')}
                style={{ ...S.btnSec, borderColor: '#5a9a6a', color: '#5a9a6a' }}
              >
                CONTINUE
              </button>
              <button
                onClick={() => onRespond?.('abort')}
                style={{ ...S.btnSec, borderColor: '#c0564a', color: '#c0564a' }}
              >
                ABORT
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '4px',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  phaseRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  phaseLabel: {
    fontFamily: FONTS.mono,
    fontSize: '11px',
    letterSpacing: '3px',
    color: COLORS.text,
    fontWeight: 500,
  },
  spinner: {
    width: '10px',
    height: '10px',
    border: `1.5px solid ${COLORS.textDim}`,
    borderTopColor: COLORS.text,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  description: {
    fontFamily: FONTS.mono,
    fontSize: '12px',
    color: COLORS.textMid,
    lineHeight: 1.5,
  },
  subDescription: {
    fontFamily: FONTS.mono,
    fontSize: '10px',
    color: COLORS.textDim,
    fontStyle: 'italic',
  },
  checkInBox: {
    marginTop: '8px',
    padding: '16px',
    border: `1px solid rgba(232,228,222,0.15)`,
    borderRadius: '4px',
    background: 'rgba(232,228,222,0.02)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  checkInLabel: {
    fontFamily: FONTS.mono,
    fontSize: '8px',
    letterSpacing: '2px',
    color: '#b89c4a',
  },
  checkInMessage: {
    fontFamily: FONTS.mono,
    fontSize: '11px',
    color: COLORS.text,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  evalRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
  },
  evalScore: {
    fontFamily: FONTS.mono,
    fontSize: '16px',
    fontWeight: 600,
  },
  evalText: {
    fontFamily: FONTS.mono,
    fontSize: '10px',
    color: COLORS.textMid,
  },
  screenshot: {
    maxWidth: '100%',
    maxHeight: '200px',
    borderRadius: '3px',
    border: `1px solid ${COLORS.border}`,
    objectFit: 'contain',
  },
  checkInActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
};
