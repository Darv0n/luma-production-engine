/**
 * WAR ROOM MESSAGE
 *
 * Renders a single WarRoomTurn with role-appropriate styling.
 * Handles inline images, evaluations, gate action buttons, and platform actions.
 */

import { S, COLORS, FONTS } from '../styles/theme.js';

const ROLE_COLORS = {
  claude: '#b89c4a',   // gold
  gemini: '#6a8ab8',   // blue
  human:  '#5a9a6a',   // green
};

const ROLE_LABELS = {
  claude: 'AUTEUR',
  gemini: 'COUNSEL',
  human:  'YOU',
};

const TYPE_BADGES = {
  'platform-action': { label: 'PLATFORM', color: '#8a6ab8' },
  'screenshot':      { label: 'CAPTURE', color: '#6a8a8a' },
  'keyframe':        { label: 'KEYFRAME', color: '#b86a8a' },
  'evaluation':      { label: 'EVAL', color: '#6ab88a' },
  'gate':            { label: 'GATE', color: '#b8a86a' },
};

export default function WarRoomMessage({ turn, onPushToPlatform }) {
  const color = ROLE_COLORS[turn.role] || COLORS.textMid;
  const label = ROLE_LABELS[turn.role] || turn.role.toUpperCase();
  const isHuman = turn.role === 'human';
  const badge = TYPE_BADGES[turn.type];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isHuman ? 'flex-end' : 'flex-start',
      marginBottom: '12px',
      animation: 'fadeIn 0.3s ease',
    }}>
      {/* Role label + type badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '4px',
      }}>
        <span style={{
          fontFamily: FONTS.mono,
          fontSize: '8px',
          letterSpacing: '2px',
          color,
          textTransform: 'uppercase',
          opacity: 0.8,
        }}>
          {label}
        </span>
        {badge && (
          <span style={{
            fontFamily: FONTS.mono,
            fontSize: '7px',
            letterSpacing: '1.5px',
            color: badge.color,
            padding: '1px 5px',
            border: `1px solid ${badge.color}33`,
            borderRadius: '2px',
          }}>
            {badge.label}
          </span>
        )}
        <span style={{
          fontFamily: FONTS.mono,
          fontSize: '7px',
          color: COLORS.textDim,
        }}>
          {new Date(turn.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Message bubble */}
      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: '4px',
        background: isHuman
          ? 'rgba(90,154,106,0.08)'
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${color}22`,
        borderLeft: isHuman ? 'none' : `2px solid ${color}44`,
        borderRight: isHuman ? `2px solid ${color}44` : 'none',
      }}>
        {/* Message text */}
        <div style={{
          fontFamily: FONTS.mono,
          fontSize: '11px',
          lineHeight: '1.6',
          color: COLORS.text,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {turn.message}
        </div>

        {/* Inline image (keyframe or screenshot) */}
        {turn.imageBase64 && (
          <div style={{ marginTop: '8px' }}>
            <img
              src={`data:image/png;base64,${turn.imageBase64}`}
              alt={turn.type}
              style={{
                maxWidth: '100%',
                maxHeight: '300px',
                borderRadius: '3px',
                border: `1px solid ${COLORS.border}`,
              }}
            />
            {/* Push to Platform button for keyframes */}
            {turn.type === 'keyframe' && turn.assetId && onPushToPlatform && (
              <button
                onClick={() => onPushToPlatform(turn.assetId)}
                style={{
                  ...S.btnSec,
                  marginTop: '6px',
                  fontSize: '8px',
                  letterSpacing: '1.5px',
                  padding: '5px 10px',
                  borderColor: '#8a6ab833',
                  color: '#8a6ab8',
                }}
              >
                PUSH TO PLATFORM
              </button>
            )}
          </div>
        )}

        {/* Evaluation display */}
        {turn.evaluation && turn.type === 'evaluation' && (
          <div style={{
            marginTop: '8px',
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${COLORS.border}`,
            borderRadius: '3px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
            }}>
              <span style={{
                fontFamily: FONTS.mono,
                fontSize: '16px',
                fontWeight: '600',
                color: turn.evaluation.score >= 80 ? COLORS.scoreGood
                     : turn.evaluation.score >= 50 ? COLORS.scoreWarn
                     : COLORS.scoreError,
              }}>
                {turn.evaluation.score}
              </span>
              <span style={{
                fontFamily: FONTS.mono,
                fontSize: '9px',
                letterSpacing: '1px',
                color: COLORS.textDim,
              }}>
                / 100
              </span>
              {turn.evaluation.recommendation && (
                <span style={{
                  fontFamily: FONTS.mono,
                  fontSize: '8px',
                  letterSpacing: '1px',
                  padding: '2px 6px',
                  borderRadius: '2px',
                  background: turn.evaluation.recommendation === 'approve'
                    ? 'rgba(90,154,106,0.15)' : 'rgba(192,86,74,0.15)',
                  color: turn.evaluation.recommendation === 'approve'
                    ? COLORS.scoreGood : COLORS.scoreError,
                }}>
                  {turn.evaluation.recommendation.toUpperCase()}
                </span>
              )}
            </div>
            {turn.evaluation.assessment && (
              <div style={{
                fontFamily: FONTS.mono,
                fontSize: '9px',
                lineHeight: '1.5',
                color: COLORS.textMid,
              }}>
                {turn.evaluation.assessment}
              </div>
            )}
          </div>
        )}

        {/* Gate: decision options */}
        {turn.type === 'gate' && turn.evaluation?.options && (
          <div style={{
            marginTop: '8px',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            {turn.evaluation.options.map(opt => (
              <span key={opt} style={{
                fontFamily: FONTS.mono,
                fontSize: '9px',
                letterSpacing: '1px',
                padding: '4px 10px',
                border: `1px solid ${COLORS.borderActive}`,
                borderRadius: '3px',
                color: COLORS.textMid,
              }}>
                {opt.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {/* Metadata */}
        {turn.metadata && (
          <div style={{
            marginTop: '6px',
            fontFamily: FONTS.mono,
            fontSize: '7px',
            color: COLORS.textDim,
          }}>
            {turn.metadata.model && `${turn.metadata.model} `}
            {turn.metadata.tokens && `${turn.metadata.tokens}tok `}
            {turn.metadata.latencyMs && `${turn.metadata.latencyMs}ms`}
          </div>
        )}
      </div>
    </div>
  );
}
