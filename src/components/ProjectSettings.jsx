/**
 * PROJECT SETTINGS PANEL
 *
 * Post-pipeline settings that apply to existing shots:
 *   Hard stops — pause points in the pipeline
 *   Global defaults — cascade to all shots (overridable per-shot)
 *   "Apply auteur to all shots" — post-hoc camera assignment
 *
 * Creative direction (mode/auteur/mood/energy) has been extracted
 * to CreativeDirection.jsx and lives pre-pipeline (Sprint 04).
 *
 * Mounted above the shot list in SchemaOutput.
 * Settings live in project.settings and persist to disk.
 */

import { useState } from 'react';
import { S } from '../styles/theme.js';

const LABEL = {
  ...S.mono,
  fontSize: '10px',
  letterSpacing: '1.5px',
  color: 'rgba(232,228,222,0.3)',
};

const SEL = {
  ...S.input,
  fontSize: '9px',
  padding: '4px 8px',
  height: '26px',
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

  const auteur = settings?.auteur || 'none';
  const hardStops = settings?.hardStops || {};
  const defaults = settings?.defaults || {};

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
        {/* Apply auteur to all shots */}
        {auteur !== 'none' && shots.length > 0 && (
          <button
            onClick={onApplyAuteur}
            disabled={applyingAuteur}
            style={{
              ...S.btnSec,
              fontSize: '9px',
              padding: '5px 14px',
              letterSpacing: '1px',
              color: applyingAuteur ? '#b89c4a' : '#5a9a6a',
              borderColor: applyingAuteur ? 'rgba(184,156,74,0.3)' : 'rgba(90,154,106,0.3)',
              animation: applyingAuteur ? 'pulse 1.5s infinite' : 'none',
            }}
          >
            {applyingAuteur ? 'APPLYING\u2026' : '\u2192 APPLY AUTEUR TO ALL SHOTS'}
          </button>
        )}

        {/* Hard stop indicators */}
        {(hardStops.afterArc || hardStops.afterShots) && (
          <span style={{ ...LABEL, color: '#b89c4a' }}>
            PAUSE {[hardStops.afterArc && 'ARC', hardStops.afterShots && 'SHOTS'].filter(Boolean).join(' + ')}
          </span>
        )}

        <span
          onClick={() => setOpen((o) => !o)}
          style={{ ...LABEL, cursor: 'pointer', padding: '4px 0' }}
        >
          SHOT SETTINGS {open ? '▴' : '▾'}
        </span>
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
                    fontSize: '9px',
                    padding: '5px 14px',
                    letterSpacing: '1px',
                    color: hardStops[key] ? '#b89c4a' : 'rgba(232,228,222,0.25)',
                    borderColor: hardStops[key] ? 'rgba(184,156,74,0.3)' : 'rgba(232,228,222,0.06)',
                    background: hardStops[key] ? 'rgba(184,156,74,0.05)' : 'transparent',
                  }}
                >
                  {hardStops[key] ? 'PAUSE ' : ''}{label}
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
                  ...S.btnSec, fontSize: '9px', padding: '4px 12px',
                  color: defaults.autoAudio ? '#5a9a6a' : 'rgba(232,228,222,0.25)',
                  borderColor: defaults.autoAudio ? 'rgba(90,154,106,0.3)' : 'rgba(232,228,222,0.06)',
                }}
              >
                {defaults.autoAudio ? 'AUTO AUDIO' : 'AUTO AUDIO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
