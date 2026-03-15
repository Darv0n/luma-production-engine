import { useState } from "react";
import { S } from "../styles/theme.js";
import { validatePrompt } from "../lib/validator.js";
import { estimateCredits } from "../lib/credits.js";
import { buildFullSchema } from "../lib/schema-builder.js";

export default function SchemaOutput({
  result,
  onUpdateShot,
  onRerunShot,
  rerunningShot = -1,
  concept = "",
  format = "",
  product = "",
  targetDuration = "",
}) {
  const [copied, setCopied] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(-1);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editPrompt, setEditPrompt] = useState("");

  const { analysis, arcData, shots, validations } = result;
  const schema = buildFullSchema(concept, format, product, targetDuration, analysis, arcData, shots, validations);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(schema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPrompt = (i) => {
    navigator.clipboard.writeText(shots[i]?.prompt || "");
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx(-1), 1500);
  };

  const startEdit = (i) => {
    setEditingIdx(i);
    setEditPrompt(shots[i]?.prompt || "");
  };

  const saveEdit = (i) => {
    if (onUpdateShot) onUpdateShot(i, { ...shots[i], prompt: editPrompt });
    setEditingIdx(-1);
  };

  const editValidation = editingIdx >= 0 ? validatePrompt(editPrompt) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ ...S.mono, fontSize: "10px", ...S.dim, letterSpacing: "1px" }}>
          {shots.length} SHOTS · {estimateCredits(shots).toLocaleString()} CREDITS
        </div>
        <button onClick={handleCopyAll} style={S.btnPrimary}>
          {copied ? "✓ COPIED FULL SCHEMA" : "⧉ COPY PRODUCTION SCHEMA"}
        </button>
      </div>

      {/* Per-shot cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {shots.map((s, i) => {
          const v = validations?.[i] || { score: 0, wordCount: 0, issues: [] };
          const isEditing = editingIdx === i;
          return (
            <div
              key={i}
              style={{
                ...S.card,
                padding: "12px 16px",
                borderLeft: `2px solid ${
                  v.score >= 75
                    ? "rgba(90,154,106,0.3)"
                    : v.score >= 50
                    ? "rgba(184,156,74,0.3)"
                    : "rgba(192,86,74,0.3)"
                }`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span style={{ ...S.mono, fontSize: "10px", ...S.dim }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ ...S.mono, fontSize: "12px", ...S.bright }}>{s.name}</span>
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim }}>
                    {s.model} · {s.mode} · {s.aspect} · {s.duration}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span
                    style={{
                      ...S.mono,
                      fontSize: "9px",
                      color:
                        v.score >= 75 ? "#5a9a6a" : v.score >= 50 ? "#b89c4a" : "#c0564a",
                    }}
                  >
                    {v.score}/100 [{v.wordCount}w]
                  </span>
                  <button
                    onClick={() => (isEditing ? saveEdit(i) : startEdit(i))}
                    style={{ ...S.btnSec, padding: "4px 10px", fontSize: "8px" }}
                  >
                    {isEditing ? "SAVE" : "EDIT"}
                  </button>
                  <button
                    onClick={() => handleCopyPrompt(i)}
                    style={{ ...S.btnSec, padding: "4px 10px", fontSize: "8px" }}
                  >
                    {copiedIdx === i ? "✓" : "COPY"}
                  </button>
                  {onRerunShot && (
                    <button
                      onClick={() => rerunningShot === -1 && onRerunShot(i)}
                      disabled={rerunningShot >= 0}
                      style={{
                        ...S.btnSec,
                        padding: "4px 10px",
                        fontSize: "8px",
                        color: rerunningShot === i ? "#b89c4a" : undefined,
                        borderColor: rerunningShot === i ? "rgba(184,156,74,0.3)" : undefined,
                        animation: rerunningShot === i ? "pulse 1.5s infinite" : "none",
                      }}
                      title="Regenerate this shot (arc context frozen)"
                    >
                      {rerunningShot === i ? "…" : "↻"}
                    </button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div>
                  <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    style={{ ...S.input, minHeight: "60px", fontSize: "11px", lineHeight: "1.6" }}
                  />
                  {editValidation && editValidation.issues.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                      {editValidation.issues.map((iss, j) => (
                        <span
                          key={j}
                          style={{
                            ...S.mono,
                            fontSize: "9px",
                            padding: "2px 8px",
                            borderRadius: "2px",
                            background:
                              iss.sev === "error"
                                ? "rgba(192,86,74,0.1)"
                                : "rgba(184,156,74,0.1)",
                            color: iss.sev === "error" ? "#c0564a" : "#b89c4a",
                          }}
                        >
                          {iss.msg}
                        </span>
                      ))}
                    </div>
                  )}
                  {editValidation && (
                    <div
                      style={{
                        ...S.mono,
                        fontSize: "9px",
                        marginTop: "4px",
                        color: editValidation.score >= 75 ? "#5a9a6a" : "#b89c4a",
                      }}
                    >
                      {editValidation.wordCount}w · {editValidation.score}/100
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    ...S.mono,
                    fontSize: "11px",
                    color: "rgba(232,228,222,0.6)",
                    lineHeight: "1.6",
                    padding: "6px 10px",
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: "3px",
                  }}
                >
                  {s.prompt}
                </div>
              )}

              {/* Vision + Audio + Cut */}
              <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    VISION{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.vision}</span>
                </div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    AUDIO{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.audio}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "4px", flexWrap: "wrap" }}>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    CUT →{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.cutType}</span>
                </div>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    RISK{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.knownRisk}</span>
                </div>
                <div>
                  <span style={{ ...S.mono, fontSize: "8px", ...S.dim, letterSpacing: "1.5px" }}>
                    CHANGE{" "}
                  </span>
                  <span style={{ fontSize: "10px", ...S.mid }}>{s.change}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Raw schema expandable */}
      <details style={{ ...S.card }}>
        <summary
          style={{
            ...S.mono,
            fontSize: "10px",
            ...S.dim,
            letterSpacing: "2px",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          RAW SCHEMA TEXT
        </summary>
        <pre
          style={{
            marginTop: "12px",
            padding: "16px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "3px",
            ...S.mono,
            fontSize: "10px",
            color: "rgba(232,228,222,0.5)",
            lineHeight: "1.5",
            overflow: "auto",
            maxHeight: "500px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {schema}
        </pre>
      </details>
    </div>
  );
}
