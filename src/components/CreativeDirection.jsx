/**
 * CREATIVE DIRECTION PANEL
 *
 * Pre-pipeline creative settings — visible BEFORE concept input.
 * Contains: Mode / Vision / Mood / Energy / LUMA BRAIN
 *
 * Vision is free text — the LLM embodies whatever the human describes
 * from latent space. No fixed director list.
 */

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
  dream: '#8a6ab8',
};

const MODE_LABELS = {
  manual: { label: 'MANUAL', sub: 'you are god' },
  hybrid: { label: 'HYBRID', sub: 'we are god' },
  auto: { label: 'AUTO', sub: 'ok claude' },
  dream: { label: 'DREAM', sub: 'auteur takes the wheel' },
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
  const vision = settings?.vision || '';
  const mood = settings?.mood || 'neutral';
  const energy = settings?.energy || 'building';
  const lumaBrain = settings?.lumaBrain || false;

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

      {/* Vision — free text */}
      <div>
        <div style={{ ...LABEL, marginBottom: '6px' }}>VISION</div>
        <input
          value={vision}
          onChange={(e) => set('vision', e.target.value)}
          placeholder="a name, a feeling, a reference — or leave empty for pure AI"
          style={{
            ...S.input,
            fontSize: '12px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.02)',
            borderColor: vision ? 'rgba(184,156,74,0.2)' : 'rgba(232,228,222,0.06)',
            color: vision ? '#b89c4a' : '#e8e4de',
          }}
        />
        {!vision && (
          <div style={{ ...S.mono, fontSize: '8px', color: 'rgba(232,228,222,0.15)', marginTop: '3px' }}>
            "Kubrick" | "rain on hot asphalt" | "aggressive minimalism" | "Tarkovsky meets neon"
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

      {/* LUMA BRAIN toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={LABEL}>LUMA BRAIN</div>
        <Chip active={lumaBrain} onClick={() => set('lumaBrain', !lumaBrain)} color="#6a8ab8">
          {lumaBrain ? 'ON' : 'OFF'}
        </Chip>
        {lumaBrain && (
          <span style={{ ...S.mono, fontSize: '8px', color: 'rgba(232,228,222,0.25)' }}>
            platform AI brainstorm (~40 credits)
          </span>
        )}
      </div>

      {/* Dream mode note */}
      {mode === 'dream' && (
        <div style={{
          ...S.mono,
          fontSize: '9px',
          color: '#8a6ab8',
          padding: '8px 12px',
          background: 'rgba(138,106,184,0.05)',
          border: '1px solid rgba(138,106,184,0.15)',
          borderRadius: '3px',
          lineHeight: '1.6',
        }}>
          Auteur operates Dream Machine autonomously. You approve at critical moments.
        </div>
      )}
    </div>
  );
}
