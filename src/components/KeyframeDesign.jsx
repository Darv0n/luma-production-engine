/**
 * KEYFRAME DESIGN PANEL
 *
 * Generate Photon images before animating with Ray3.
 * Essential for any object/character that doesn't exist in training data:
 *   - Invented products (grass sandals)
 *   - Original characters (foot gremlins)
 *   - Scene compositions that need exact visual definition
 *
 * Workflow:
 *   1. Add a keyframe — write a Photon prompt describing the object
 *   2. Generate → instant image (~4 credits, sync)
 *   3. Review — iterate prompt if not right
 *   4. Assign to shots — that image becomes frame0 for those shots
 *   5. Draft/Final generation uses I2V from this keyframe
 *
 * Keyframes persist in project.keyframes[].
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { S } from '../styles/theme.js';
import { generateKeyframeImage } from '../lib/luma-client.js';
import { generateId } from '../store/project-model.js';

const LABEL = { ...S.mono, fontSize: '8px', letterSpacing: '1.5px', color: 'rgba(232,228,222,0.3)' };

const TYPE_COLORS = {
  product: '#5a9a6a',
  character: '#b89c4a',
  scene: '#6a8ab8',
};

export default function KeyframeDesign({
  keyframes = [],
  shots = [],
  onUpdateKeyframes,
  onUpdateShotKeyframe,
}) {
  // Always-current ref so async generate callbacks see latest keyframes
  const keyframesRef = useRef(keyframes);
  useEffect(() => { keyframesRef.current = keyframes; }, [keyframes]);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newType, setNewType] = useState('product');
  const [generating, setGenerating] = useState(null); // keyframe id being generated
  const [iteratingId, setIteratingId] = useState(null);
  const [iteratePrompt, setIteratePrompt] = useState('');

  const handleGenerate = useCallback(async (kf) => {
    setGenerating(kf.id);
    try {
      const result = await generateKeyframeImage(kf.prompt, kf.aspectRatio || '9:16');
      // Use ref so we always update the latest keyframes list, not a stale closure
      const updated = keyframesRef.current.map((k) =>
        k.id === kf.id ? { ...k, imageUrl: result.imageUrl, generationId: result.id } : k
      );
      onUpdateKeyframes(updated);
    } catch (e) {
      console.error('Keyframe generation failed:', e);
    }
    setGenerating(null);
  }, [onUpdateKeyframes]);

  const handleAdd = useCallback(() => {
    if (!newName.trim() || !newPrompt.trim()) return;
    const kf = {
      id: generateId(),
      name: newName.trim(),
      prompt: newPrompt.trim(),
      type: newType,
      imageUrl: null,
      generationId: null,
      aspectRatio: '9:16',
    };
    onUpdateKeyframes([...keyframes, kf]);
    setNewName('');
    setNewPrompt('');
    setAdding(false);
    // Auto-generate immediately
    setTimeout(() => handleGenerate(kf), 100);
  }, [newName, newPrompt, newType, keyframes, onUpdateKeyframes, handleGenerate]);

  const handleDelete = (id) => {
    onUpdateKeyframes(keyframes.filter((k) => k.id !== id));
    // Unassign from any shots
    shots.forEach((s, i) => {
      if (s.keyframeId === id) onUpdateShotKeyframe(i, null);
    });
  };

  const handleIterateSave = (kf) => {
    const updated = keyframes.map((k) =>
      k.id === kf.id ? { ...k, prompt: iteratePrompt } : k
    );
    onUpdateKeyframes(updated);
    setIteratingId(null);
    // Re-generate with new prompt
    setTimeout(() => {
      const newKf = { ...kf, prompt: iteratePrompt };
      handleGenerate(newKf);
    }, 100);
  };

  const shotsUsing = (id) => shots.filter((s) => s.keyframeId === id).map((s) => s.name);

  return (
    <div style={{
      borderBottom: '1px solid rgba(232,228,222,0.06)',
      marginBottom: '16px',
      paddingBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{ ...S.mono, fontSize: '8px', letterSpacing: '3px', color: 'rgba(232,228,222,0.25)' }}>
          KEYFRAME DESIGN
        </div>
        <div style={{ ...S.mono, fontSize: '8px', color: 'rgba(232,228,222,0.2)' }}>
          Design objects + characters with Photon before animating with Ray3
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          style={{
            ...S.btnSec, fontSize: '8px', padding: '3px 10px', marginLeft: 'auto',
            color: adding ? '#b89c4a' : 'rgba(232,228,222,0.35)',
            borderColor: adding ? 'rgba(184,156,74,0.3)' : 'rgba(232,228,222,0.06)',
          }}
        >
          {adding ? '✕ CANCEL' : '+ ADD KEYFRAME'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{
          padding: '12px 14px',
          background: 'rgba(184,156,74,0.04)',
          border: '1px solid rgba(184,156,74,0.15)',
          borderRadius: '3px',
          marginBottom: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="name (e.g. Grass Sandal)"
              style={{ ...S.input, fontSize: '9px', padding: '5px 8px', width: '160px' }}
            />
            <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ ...S.input, fontSize: '9px', padding: '5px 8px', height: '28px' }}>
              <option value="product">PRODUCT</option>
              <option value="character">CHARACTER</option>
              <option value="scene">SCENE</option>
            </select>
          </div>
          <textarea
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Photon prompt — describe the object/character in precise visual detail. No dead words. No 'beautiful' or 'stunning'. Describe what the camera sees: materials, texture, light, position."
            style={{ ...S.input, fontSize: '9px', padding: '8px', minHeight: '70px', lineHeight: '1.5' }}
          />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newPrompt.trim()}
              style={{ ...S.btnSec, fontSize: '9px', padding: '6px 16px', color: '#b89c4a', borderColor: 'rgba(184,156,74,0.3)' }}
            >
              ⚡ GENERATE KEYFRAME
            </button>
            <span style={{ ...LABEL }}>~4 credits · instant · Photon</span>
          </div>
        </div>
      )}

      {/* Keyframe gallery */}
      {keyframes.length === 0 && !adding && (
        <div style={{ ...S.mono, fontSize: '9px', color: 'rgba(232,228,222,0.15)', padding: '8px 0' }}>
          No keyframes yet. Add one to define novel objects before generating shots.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {keyframes.map((kf) => (
          <div key={kf.id} style={{
            display: 'flex',
            gap: '12px',
            padding: '10px 12px',
            background: 'rgba(0,0,0,0.2)',
            border: `1px solid ${kf.imageUrl ? `${TYPE_COLORS[kf.type]}22` : 'rgba(232,228,222,0.05)'}`,
            borderRadius: '3px',
          }}>
            {/* Image preview */}
            <div style={{ width: '80px', flexShrink: 0 }}>
              {kf.imageUrl ? (
                <img
                  src={kf.imageUrl}
                  alt={kf.name}
                  style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '2px', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: '80px', height: '80px', borderRadius: '2px',
                  background: 'rgba(232,228,222,0.03)',
                  border: '1px dashed rgba(232,228,222,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...S.mono, fontSize: '8px', color: 'rgba(232,228,222,0.2)',
                  textAlign: 'center',
                }}>
                  {generating === kf.id ? 'GENERATING…' : 'NO IMAGE'}
                </div>
              )}
            </div>

            {/* Details */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ ...S.mono, fontSize: '9px', color: TYPE_COLORS[kf.type] || '#e8e4de', letterSpacing: '1px' }}>
                  {kf.type.toUpperCase()}
                </span>
                <span style={{ ...S.mono, fontSize: '10px', color: '#e8e4de' }}>{kf.name}</span>
                {shotsUsing(kf.id).length > 0 && (
                  <span style={{ ...S.mono, fontSize: '8px', color: 'rgba(232,228,222,0.3)' }}>
                    → {shotsUsing(kf.id).join(', ')}
                  </span>
                )}
              </div>

              {iteratingId === kf.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <textarea
                    value={iteratePrompt}
                    onChange={(e) => setIteratePrompt(e.target.value)}
                    style={{ ...S.input, fontSize: '8px', padding: '6px', minHeight: '50px', lineHeight: '1.5' }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleIterateSave(kf)} style={{ ...S.btnSec, fontSize: '8px', padding: '3px 10px', color: '#b89c4a', borderColor: 'rgba(184,156,74,0.3)' }}>
                      ↻ REGENERATE
                    </button>
                    <button onClick={() => setIteratingId(null)} style={{ ...S.btnSec, fontSize: '8px', padding: '3px 8px' }}>CANCEL</button>
                  </div>
                </div>
              ) : (
                <div style={{ ...S.mono, fontSize: '8px', color: 'rgba(232,228,222,0.35)', lineHeight: '1.5' }}>
                  {kf.prompt.slice(0, 120)}{kf.prompt.length > 120 ? '…' : ''}
                </div>
              )}

              {/* Shot assignment */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                {shots.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => onUpdateShotKeyframe(i, s.keyframeId === kf.id ? null : kf.id)}
                    style={{
                      ...S.btnSec, fontSize: '7px', padding: '2px 7px',
                      color: s.keyframeId === kf.id ? TYPE_COLORS[kf.type] : 'rgba(232,228,222,0.2)',
                      borderColor: s.keyframeId === kf.id ? `${TYPE_COLORS[kf.type]}44` : 'rgba(232,228,222,0.05)',
                    }}
                    title={`${s.keyframeId === kf.id ? 'Remove from' : 'Assign to'} shot ${i + 1}`}
                  >
                    {s.keyframeId === kf.id ? '✓ ' : ''}{String(i + 1).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={() => handleGenerate(kf)}
                disabled={generating === kf.id}
                style={{ ...S.btnSec, fontSize: '7px', padding: '3px 8px', color: '#b89c4a', borderColor: 'rgba(184,156,74,0.2)', animation: generating === kf.id ? 'pulse 1.5s infinite' : 'none' }}
              >
                {generating === kf.id ? '…' : '↻'}
              </button>
              <button
                onClick={() => { setIteratingId(kf.id); setIteratePrompt(kf.prompt); }}
                style={{ ...S.btnSec, fontSize: '7px', padding: '3px 8px' }}
              >
                EDIT
              </button>
              <button
                onClick={() => handleDelete(kf.id)}
                style={{ ...S.btnSec, fontSize: '7px', padding: '3px 8px', opacity: 0.4 }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
