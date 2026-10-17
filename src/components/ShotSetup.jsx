/**
 * SHOT SETUP PANEL
 *
 * Inline collapsible settings panel for each shot.
 * Exposes all Luma generation parameters — model, dynamic range,
 * camera control, enhance, audio, post-chain (upscale/audio/extend).
 *
 * Opens via the SETUP button beside EDIT in each shot card.
 * Settings are saved back to the shot object via onUpdate.
 */

import { useState } from "react";
import { S } from "../styles/theme.js";
import { CAMERA_CONTROLS, CAMERA_CONTROL_CATEGORIES, controlPreviewUrl } from "../lib/camera-controls.js";

const ROW = { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" };

const FIELD_LABEL = {
  ...S.mono,
  fontSize: "10px",
  letterSpacing: "1.5px",
  color: "rgba(232,228,222,0.45)",
  minWidth: "90px",
};

const SEL = {
  ...S.input,
  fontSize: "9px",
  padding: "4px 8px",
  height: "26px",
};

function Toggle({ value, onChange, label }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        ...S.btnSec,
        fontSize: "9px",
        padding: "4px 12px",
        letterSpacing: "1px",
        color: value ? "#5a9a6a" : "rgba(232,228,222,0.4)",
        borderColor: value ? "rgba(90,154,106,0.3)" : "rgba(232,228,222,0.12)",
        background: value ? "rgba(90,154,106,0.06)" : "transparent",
      }}
    >
      {value ? "✓ " : ""}{label}
    </button>
  );
}

export default function ShotSetup({ shot, onUpdate, isOpen, onToggle, projectDefaults = {} }) {
  const [hoveredControl, setHoveredControl] = useState(null);

  const set = (key, val) => onUpdate({ ...shot, [key]: val });

  // Resolve effective value: shot override > project default > hardcoded default
  const eff = (key, fallback) => shot[key] ?? projectDefaults[key] ?? fallback;
  // Is this field overridden at shot level?
  const overridden = (key) => shot[key] != null && shot[key] !== (projectDefaults[key] ?? null);
  const resetField = (key) => onUpdate({ ...shot, [key]: null });

  const fieldStyle = (key) => ({
    ...SEL,
    borderColor: overridden(key) ? 'rgba(184,156,74,0.3)' : undefined,
    color: overridden(key) ? '#b89c4a' : undefined,
  });

  if (!isOpen) return null;

  return (
    <div
      style={{
        marginTop: "10px",
        padding: "12px 14px",
        background: "rgba(0,0,0,0.25)",
        borderRadius: "3px",
        border: "1px solid rgba(232,228,222,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ ...S.mono, fontSize: "10px", letterSpacing: "2px", color: "rgba(232,228,222,0.35)", marginBottom: "2px" }}>
        SHOT SETUP
      </div>

      {/* Auteur indicator */}
      {shot._auteurApplied && (
        <div style={{ ...S.mono, fontSize: '8px', color: '#b89c4a', marginBottom: '2px' }}>
          ✦ auteur: {shot._auteurApplied === 'ai' ? 'AI' : shot._auteurApplied}
          {shot._auteurRationale && <span style={{ color: 'rgba(184,156,74,0.5)', marginLeft: '6px' }}>{shot._auteurRationale}</span>}
        </div>
      )}

      {/* Model + Dynamic Range */}
      <div style={ROW}>
        <span style={FIELD_LABEL}>MODEL</span>
        <select value={eff("model", "Ray3.14")} onChange={(e) => set("model", e.target.value)} style={{ ...SEL, ...fieldStyle("model"), width: "110px" }}>
          <option value="Ray3.14">Ray3.14 (fast)</option>
          <option value="Ray3">Ray3 (char ref)</option>
        </select>
        <span style={FIELD_LABEL}>RANGE</span>
        <select value={eff("dynamicRange", "standard")} onChange={(e) => set("dynamicRange", e.target.value)} style={{ ...SEL, ...fieldStyle("dynamicRange"), width: "100px" }}>
          <option value="standard">Standard</option>
          <option value="hdr">HDR</option>
        </select>
        {overridden("dynamicRange") && <button onClick={() => resetField("dynamicRange")} style={{ ...S.btnSec, fontSize: '7px', padding: '2px 6px', color: 'rgba(232,228,222,0.3)' }}>×</button>}
        <Toggle value={shot.enhance !== false} onChange={(v) => set("enhance", v)} label="ENHANCE" />
      </div>

      {/* Duration + Aspect + Loop */}
      <div style={ROW}>
        <span style={FIELD_LABEL}>DURATION</span>
        <select value={shot.duration || "5s"} onChange={(e) => set("duration", e.target.value)} style={{ ...SEL, width: "70px" }}>
          <option value="5s">5s</option>
          <option value="9s">9s</option>
        </select>
        <span style={FIELD_LABEL}>ASPECT</span>
        <select value={shot.aspect || "16:9"} onChange={(e) => set("aspect", e.target.value)} style={{ ...SEL, width: "80px" }}>
          {["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <Toggle value={!!shot.loop} onChange={(v) => set("loop", v)} label="LOOP" />
      </div>

      {/* Camera Control */}
      <div style={ROW}>
        <span style={FIELD_LABEL}>CAMERA</span>
        <div style={{ position: "relative" }}>
          <select
            value={eff("cameraControl", "") || ""}
            onChange={(e) => set("cameraControl", e.target.value || null)}
            style={{ ...SEL, ...fieldStyle("cameraControl"), width: "160px" }}
          >
            <option value="">— none —</option>
            {CAMERA_CONTROL_CATEGORIES.map((cat) => (
              <optgroup key={cat} label={cat.toUpperCase()}>
                {CAMERA_CONTROLS.filter((c) => c.category === cat).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {eff("cameraControl", null) && controlPreviewUrl(eff("cameraControl", null)) && (
          <video
            src={controlPreviewUrl(eff("cameraControl", null))}
            autoPlay muted loop playsInline
            style={{ width: "60px", height: "34px", borderRadius: "2px", objectFit: "cover", opacity: overridden("cameraControl") ? 0.9 : 0.5 }}
          />
        )}
        {overridden("cameraControl") && (
          <button onClick={() => resetField("cameraControl")} style={{ ...S.btnSec, fontSize: '7px', padding: '2px 6px', color: 'rgba(232,228,222,0.3)' }}>×</button>
        )}
        {eff("cameraControl", null) && (
          <span style={{ ...S.mono, fontSize: "8px", color: overridden("cameraControl") ? "#b89c4a" : "rgba(232,228,222,0.2)" }}>
            {CAMERA_CONTROLS.find((c) => c.id === eff("cameraControl", null))?.keywords.slice(0, 2).join(", ")}
            {!overridden("cameraControl") && <span style={{ opacity: 0.5 }}> (inherited)</span>}
          </span>
        )}
      </div>

      {/* Audio Prompts */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={ROW}>
          <span style={{ ...FIELD_LABEL, minWidth: "90px" }}>AUDIO +</span>
          <input
            value={shot.audioPrompt || ""}
            onChange={(e) => set("audioPrompt", e.target.value)}
            placeholder="describe sounds to add…"
            style={{ ...SEL, flex: 1, minWidth: "200px" }}
          />
        </div>
        <div style={ROW}>
          <span style={{ ...FIELD_LABEL, minWidth: "90px" }}>AUDIO −</span>
          <input
            value={shot.negativeAudioPrompt || ""}
            onChange={(e) => set("negativeAudioPrompt", e.target.value)}
            placeholder="sounds to avoid…"
            style={{ ...SEL, flex: 1, minWidth: "200px" }}
          />
        </div>
      </div>

      {/* Post-chain */}
      <div style={{ borderTop: "1px solid rgba(232,228,222,0.05)", paddingTop: "8px" }}>
        <div style={{ ...S.mono, fontSize: "10px", letterSpacing: "1.5px", color: "rgba(232,228,222,0.35)", marginBottom: "6px" }}>
          POST-CHAIN — runs after final render
        </div>
        <div style={ROW}>
          <Toggle value={!!shot.autoAudio} onChange={(v) => set("autoAudio", v)} label="ADD AUDIO" />
          <span style={{ ...S.mono, fontSize: "8px", color: "rgba(232,228,222,0.2)" }}>→</span>
          <select
            value={shot.autoUpscale || "none"}
            onChange={(e) => set("autoUpscale", e.target.value === "none" ? null : e.target.value)}
            style={{ ...SEL, width: "100px" }}
          >
            <option value="none">no upscale</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="4k">4K</option>
          </select>
          <Toggle value={!!shot.autoExtend} onChange={(v) => set("autoExtend", v)} label="EXTEND →" />
          {shot.autoExtend && (
            <span style={{ ...S.mono, fontSize: "8px", color: "#b89c4a" }}>
              chains last_frame → next shot
            </span>
          )}
        </div>
      </div>

      {/* Character ref note */}
      {shot.characterRef && shot.characterRef !== "none" && (
        <div style={{ ...S.mono, fontSize: "8px", color: "#b89c4a", padding: "4px 8px", background: "rgba(184,156,74,0.06)", borderRadius: "2px" }}>
          ⚠ char ref @{shot.characterRef} — Ray3 required, model locked
        </div>
      )}
    </div>
  );
}
