/**
 * PRODUCTION TIMELINE
 *
 * Horizontal shot timeline with state badges and chain connectors.
 * Each shot shows keyframe thumbnails, generation state, and score.
 */

import { COLORS, FONTS } from '../styles/theme.js';

const STATE_COLORS = {
  waiting: COLORS.textDim,
  submitting: '#b89c4a',
  polling: '#b89c4a',
  evaluating: '#b89c4a',
  approved: '#5a9a6a',
  failed: '#c0564a',
  'design.generating': '#b89c4a',
  'design.reviewing': '#b89c4a',
  'design.approved': '#5a9a6a',
};

const STATE_LABELS = {
  waiting: 'WAITING',
  submitting: 'SUBMITTING',
  polling: 'GENERATING',
  evaluating: 'EVALUATING',
  approved: 'APPROVED',
  failed: 'FAILED',
};

export default function ProductionTimeline({ shotPlan, generations, keyframes, chainedIds, currentShot }) {
  if (!shotPlan || shotPlan.length === 0) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center' }}>
        <span style={{ color: COLORS.textDim, fontSize: '11px', fontFamily: FONTS.mono }}>
          No shots planned yet
        </span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {shotPlan.map((shot, i) => {
        const gen = generations?.[i] || {};
        const kf = keyframes?.[i] || {};
        const isActive = currentShot === i;
        const isChained = !!chainedIds?.[i];

        return (
          <div key={i} style={styles.shotGroup}>
            {/* Connector arrow (between shots) */}
            {i > 0 && (
              <div style={styles.connector}>
                <div style={{
                  ...styles.connectorLine,
                  background: isChained ? '#5a9a6a' : COLORS.border,
                }} />
                {isChained && (
                  <span style={styles.chainBadge}>CHAINED</span>
                )}
              </div>
            )}

            {/* Shot card */}
            <div style={{
              ...styles.shotCard,
              borderColor: isActive
                ? 'rgba(232,228,222,0.3)'
                : STATE_COLORS[gen.state] || COLORS.border,
              boxShadow: isActive ? '0 0 12px rgba(232,228,222,0.05)' : 'none',
            }}>
              {/* Shot number + name */}
              <div style={styles.shotHeader}>
                <span style={styles.shotNumber}>{i + 1}</span>
                <span style={styles.shotName}>{shot.name || `Shot ${i + 1}`}</span>
              </div>

              {/* Keyframe thumbnails */}
              <div style={styles.keyframeRow}>
                <div style={styles.keyframeThumbnail}>
                  {kf.hasStart || kf.startReady ? (
                    <div style={{ ...styles.kfFilled, background: '#1a2a1a' }}>S</div>
                  ) : (
                    <div style={styles.kfEmpty}>-</div>
                  )}
                </div>
                <span style={{ color: COLORS.textDim, fontSize: '8px' }}>~</span>
                <div style={styles.keyframeThumbnail}>
                  {kf.hasEnd || kf.endReady ? (
                    <div style={{ ...styles.kfFilled, background: '#2a1a1a' }}>E</div>
                  ) : (
                    <div style={styles.kfEmpty}>-</div>
                  )}
                </div>
              </div>

              {/* State badge */}
              <div style={{
                ...styles.stateBadge,
                color: STATE_COLORS[gen.state] || COLORS.textDim,
                borderColor: STATE_COLORS[gen.state] || COLORS.border,
              }}>
                {STATE_LABELS[gen.state] || gen.state?.toUpperCase() || 'WAITING'}
              </div>

              {/* Score */}
              {gen.score !== null && gen.score !== undefined && (
                <div style={{
                  ...styles.score,
                  color: gen.score >= 80 ? '#5a9a6a' : gen.score >= 50 ? '#b89c4a' : '#c0564a',
                }}>
                  {gen.score}/100
                </div>
              )}

              {/* Attempt count */}
              {gen.attempts > 0 && (
                <div style={styles.attempts}>
                  attempt {gen.attempts}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    overflowX: 'auto',
    padding: '16px 0',
    gap: '0',
  },
  shotGroup: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  connector: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '48px',
    gap: '4px',
  },
  connectorLine: {
    width: '100%',
    height: '2px',
    borderRadius: '1px',
  },
  chainBadge: {
    fontFamily: FONTS.mono,
    fontSize: '7px',
    letterSpacing: '1.5px',
    color: '#5a9a6a',
  },
  shotCard: {
    border: `1px solid ${COLORS.border}`,
    borderRadius: '6px',
    padding: '12px 14px',
    background: COLORS.surface,
    minWidth: '140px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    transition: 'border-color 0.3s, box-shadow 0.3s',
  },
  shotHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  shotNumber: {
    fontFamily: FONTS.mono,
    fontSize: '16px',
    fontWeight: 600,
    color: COLORS.textMid,
    lineHeight: 1,
  },
  shotName: {
    fontFamily: FONTS.mono,
    fontSize: '10px',
    color: COLORS.textMid,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100px',
  },
  keyframeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  keyframeThumbnail: {
    width: '36px',
    height: '24px',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  kfFilled: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONTS.mono,
    fontSize: '9px',
    color: COLORS.textDim,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '2px',
  },
  kfEmpty: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONTS.mono,
    fontSize: '9px',
    color: COLORS.textDim,
    border: `1px dashed ${COLORS.border}`,
    borderRadius: '2px',
  },
  stateBadge: {
    fontFamily: FONTS.mono,
    fontSize: '8px',
    letterSpacing: '1.5px',
    padding: '3px 6px',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '2px',
    textAlign: 'center',
  },
  score: {
    fontFamily: FONTS.mono,
    fontSize: '12px',
    fontWeight: 500,
    textAlign: 'center',
  },
  attempts: {
    fontFamily: FONTS.mono,
    fontSize: '8px',
    color: COLORS.textDim,
    textAlign: 'center',
  },
};
