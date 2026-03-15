/**
 * PROJECT SETTINGS PANEL
 *
 * Project-level creative direction:
 *   Mode — Manual / Hybrid / Auto
 *   Auteur — None / AI / named director
 *   Mood + Energy
 *   Hard stops — pause points in the pipeline
 *   Global defaults — cascade to all shots (overridable per-shot)
 *
 * Mounted above the shot list in SchemaOutput.
 * Settings live in project.settings and persist to disk.
 */

import { useState } from 'react';
import { S } from '../styles/theme.js';
import { DIRECTOR_LIST } from '../lib/auteur.js';

const LABEL = {
  ...S.mono,
  fontSize: '8px',
  letterSpacing: '1.5px',
  color: 'rgba(232,228,222,0.3)',
};

const SEL = {
  ...S.input,
  fontSize: '9px',
  padding: '4px 8px',
  height: '26px',
};

function Chip({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...S.btnSec,
        fontSize: '8px',
        padding: '3px 10px',
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

export default function ProjectSettings({
  settings,
  onUpdate,
  onApplyAuteur,
  applyingAuteur = false,
  shots = [],
}) {
  const [open, setOpen] = useState(false);

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
  const hardStops = settings?.hardStops || {};
  const defaults = settings?.defaults || {};

  const activeDirector = DIRECTOR_LIST.find((d) => d.id === auteur);

  return (
    <div style={{
      borderBottom: '1px solid rgba(232,228,222,0.06)',
      marginBottom: '16px',
    }}>
      {/* Header bar — always visible */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 0 10px',
        flexWrap: 'wrap',
      }}>
        {/* Mode — always visible */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {Object.entries(MODE_LABELS).map(([m, { label, sub }]) => (
            <button
              key={m}
              onClick={() => set('mode', m)}
              title={sub}
              style={{
                ...S.btnSec,
                fontSize: '9px',
                padding: '5px 14px',
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

        {/* Auteur badge — visible summary */}
        <div
          onClick={() => setOpen((o) => !o)}
          style={{
            ...S.mono,
            fontSize: '8px',
            letterSpacing: '1px',
            color: auteur !== 'none' ? '#b89c4a' : 'rgba(232,228,222,0.2)',
            cursor: 'pointer',
            padding: '4px 10px',
            border: '1px solid ' + (auteur !== 'none' ? 'rgba(184,156,74,0.2)' : 'rgba(232,228,222,0.06)'),
            borderRadius: '2px',
          }}
        >
          {auteur === 'none' ? 'AUTEUR: NONE' : auteur === 'ai' ? '✦ AI AUTEUR' : `✦ ${activeDirector?.name?.toUpperCase() || auteur.toUpperCase()}`}
        </div>

        {/* Mood badge */}
        <span
          onClick={() => setOpen((o) => !o)}
          style={{ ...LABEL, cursor: 'pointer', padding: '4px 0' }}
        >
          {mood !== 'neutral' ? mood.toUpperCase() : ''}{energy !== 'building' && mood !== 'neutral' ? ' · ' : ''}{energy !== 'building' ? energy.toUpperCase() : ''}
          {mood === 'neutral' && energy === 'building' ? 'PROJECT SETTINGS ▾' : ' ▾'}
        </span>

        {/* Hard stop indicators */}
        {(hardStops.afterArc || hardStops.afterShots) && (
          <span style={{ ...LABEL, color: '#b89c4a' }}>
            ⏸ {[hardStops.afterArc && 'ARC', hardStops.afterShots && 'SHOTS'].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {/* Expanded panel */}
      {open && (
        <div style={{
          padding: '14px 0 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          borderTop: '1px solid rgba(232,228,222,0.05)',
        }}>

          {/* Auteur */}
          <div>
            <div style={{ ...LABEL, marginBottom: '6px' }}>AUTEUR LENS</div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip active={auteur === 'none'} onClick={() => set('auteur', 'none')}>NONE</Chip>
              <Chip active={auteur === 'ai'} onClick={() => set('auteur', 'ai')} color="#b89c4a">✦ AI AUTEUR</Chip>
              {DIRECTOR_LIST.map((d) => (
                <Chip key={d.id} active={auteur === d.id} onClick={() => set('auteur', d.id)}>{d.name.toUpperCase()}</Chip>
              ))}
              {auteur !== 'none' && shots.length > 0 && (
                <button
                  onClick={onApplyAuteur}
                  disabled={applyingAuteur}
                  style={{
                    ...S.btnSec,
                    fontSize: '8px',
                    padding: '4px 12px',
                    marginLeft: '8px',
                    color: applyingAuteur ? '#b89c4a' : '#5a9a6a',
                    borderColor: applyingAuteur ? 'rgba(184,156,74,0.3)' : 'rgba(90,154,106,0.3)',
                    animation: applyingAuteur ? 'pulse 1.5s infinite' : 'none',
                  }}
                >
                  {applyingAuteur ? 'APPLYING…' : '→ APPLY TO ALL SHOTS'}
                </button>
              )}
            </div>
            {auteur !== 'none' && auteur !== 'ai' && activeDirector && (
              <div style={{ ...S.mono, fontSize: '8px', color: 'rgba(232,228,222,0.25)', marginTop: '4px' }}>
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

          {/* Hard stops */}
          <div>
            <div style={{ ...LABEL, marginBottom: '6px' }}>HARD STOPS — pause pipeline for creative review</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                ['afterArc', 'AFTER ARC', 'Review arc shape before shot generation'],
                ['afterShots', 'AFTER SHOTS', 'Review all prompts before any generation'],
                ['beforeGenerate', 'BEFORE GENERATE', 'Review settings before API calls'],
              ].map(([key, label, tip]) => (
                <button
                  key={key}
                  onClick={() => set(`hardStops.${key}`, !hardStops[key])}
                  title={tip}
                  style={{
                    ...S.btnSec,
                    fontSize: '8px',
                    padding: '4px 10px',
                    letterSpacing: '1px',
                    color: hardStops[key] ? '#b89c4a' : 'rgba(232,228,222,0.25)',
                    borderColor: hardStops[key] ? 'rgba(184,156,74,0.3)' : 'rgba(232,228,222,0.06)',
                    background: hardStops[key] ? 'rgba(184,156,74,0.05)' : 'transparent',
                  }}
                >
                  {hardStops[key] ? '⏸ ' : ''}{label}
                </button>
              ))}
            </div>
          </div>

          {/* Global defaults */}
          <div>
            <div style={{ ...LABEL, marginBottom: '6px' }}>SHOT DEFAULTS — inherited by all shots, overridable per-shot</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={LABEL}>MODEL</span>
                <select value={defaults.model || 'Ray3.14'} onChange={(e) => set('defaults.model', e.target.value)} style={{ ...SEL, width: '110px' }}>
                  <option value="Ray3.14">Ray3.14</option>
                  <option value="Ray3">Ray3</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={LABEL}>RANGE</span>
                <select value={defaults.dynamicRange || 'standard'} onChange={(e) => set('defaults.dynamicRange', e.target.value)} style={{ ...SEL, width: '100px' }}>
                  <option value="standard">Standard</option>
                  <option value="hdr">HDR</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={LABEL}>UPSCALE</span>
                <select value={defaults.autoUpscale || '1080p'} onChange={(e) => set('defaults.autoUpscale', e.target.value)} style={{ ...SEL, width: '90px' }}>
                  <option value="none">None</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="4k">4K</option>
                </select>
              </div>
              <button
                onClick={() => set('defaults.autoAudio', !defaults.autoAudio)}
                style={{
                  ...S.btnSec, fontSize: '8px', padding: '3px 10px',
                  color: defaults.autoAudio ? '#5a9a6a' : 'rgba(232,228,222,0.25)',
                  borderColor: defaults.autoAudio ? 'rgba(90,154,106,0.3)' : 'rgba(232,228,222,0.06)',
                }}
              >
                {defaults.autoAudio ? '✓ ' : ''}AUTO AUDIO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
