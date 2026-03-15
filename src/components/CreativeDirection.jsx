/**
 * CREATIVE DIRECTION PANEL
 *
 * Pre-pipeline creative settings — visible BEFORE concept input.
 * Extracted from ProjectSettings.jsx (Sprint 04: Auteur-Directed Production).
 *
 * Contains: Mode / Auteur / Mood / Energy / Director traits
 * These inform the pipeline from the first frame, not post-hoc.
 */

import { DIRECTOR_LIST } from '../lib/auteur.js';
import { S } from '../styles/theme.js';

const LABEL = {
  ...S.mono,
  fontSize: '10px',
  letterSpacing: '1.5px',
  color: 'rgba(232,228,222,0.3)',
};

const MODE_COLORS = {
  manual: '#5a9a6a',
  hybrid: '#b89c4a',
  auto: '#6a8ab8',
};

const MODE_LABELS = {
  manual: { label: 'MANUAL', sub: 'you are god' },
  hybrid: { label: 'HYBRID', sub: 'we are god' },
  auto: { label: 'AUTO', sub: 'ok claude' },
};

function Chip({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...S.btnSec,
        fontSize: '9px',
        padding: '6px 16px',
        letterSpacing: '1px',
        color: active ? (color || '#e8e4de') : 'rgba(232,228,222,0.25)',
        borderColor: active ? (color ? `${color}55` : 'rgba(232,228,222,0.2)') : 'rgba(232,228,222,0.06)',
        background: active ? 'rgba(232,228,222,0.05)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

export default function CreativeDirection({ settings, onUpdate }) {
  const set = (path, val) => {
    const parts = path.split('.');
    const next = { ...settings };
    let obj = next;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = val;
    onUpdate(next);
  };

  const mode = settings?.mode || 'hybrid';
  const auteur = settings?.auteur || 'none';
  const mood = settings?.mood || 'neutral';
  const energy = settings?.energy || 'building';

  const activeDirector = DIRECTOR_LIST.find((d) => d.id === auteur);

  return (
    <div style={{
      borderBottom: '1px solid rgba(232,228,222,0.06)',
      marginBottom: '16px',
      paddingBottom: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {/* Mode chips */}
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
        {Object.entries(MODE_LABELS).map(([m, { label, sub }]) => (
          <button
            key={m}
            onClick={() => set('mode', m)}
            title={sub}
            style={{
              ...S.btnSec,
              fontSize: '10px',
              padding: '6px 16px',
              letterSpacing: '1.5px',
              color: mode === m ? MODE_COLORS[m] : 'rgba(232,228,222,0.25)',
              borderColor: mode === m ? `${MODE_COLORS[m]}44` : 'rgba(232,228,222,0.06)',
              background: mode === m ? `${MODE_COLORS[m]}0d` : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Auteur selector */}
      <div>
        <div style={{ ...LABEL, marginBottom: '6px' }}>AUTEUR LENS</div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <Chip active={auteur === 'none'} onClick={() => set('auteur', 'none')}>NONE</Chip>
          <Chip active={auteur === 'ai'} onClick={() => set('auteur', 'ai')} color="#b89c4a">AI AUTEUR</Chip>
          {DIRECTOR_LIST.map((d) => (
            <Chip key={d.id} active={auteur === d.id} onClick={() => set('auteur', d.id)}>{d.name.toUpperCase()}</Chip>
          ))}
        </div>
        {auteur !== 'none' && auteur !== 'ai' && activeDirector && (
          <div style={{ ...S.mono, fontSize: '10px', color: 'rgba(232,228,222,0.25)', marginTop: '4px' }}>
            {activeDirector.traits}
          </div>
        )}
      </div>

      {/* Mood + Energy */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...LABEL, marginBottom: '6px' }}>MOOD</div>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {['neutral', 'intimate', 'epic', 'unsettling', 'warm', 'cold'].map((m) => (
              <Chip key={m} active={mood === m} onClick={() => set('mood', m)}>{m.toUpperCase()}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...LABEL, marginBottom: '6px' }}>ENERGY</div>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {['still', 'building', 'urgent', 'explosive'].map((e) => (
              <Chip key={e} active={energy === e} onClick={() => set('energy', e)}>{e.toUpperCase()}</Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
