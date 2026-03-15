import { S } from "../styles/theme.js";
import { estimateCredits } from "../lib/credits.js";

export default function LiveResults({ stageData }) {
  const { scan, arc, validate } = stageData;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {scan && (
        <div style={{ ...S.card, animation: "fadeIn 0.4s ease" }}>
          <div style={S.cardHead}>SCAN + TENSION</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              {Object.entries(scan.scan || {}).map(([k, v]) => (
                <div key={k} style={{ marginBottom: "8px" }}>
                  <div style={{ ...S.label, fontSize: "8px", marginBottom: "2px" }}>
                    {k.toUpperCase()}
                  </div>
                  <div style={{ fontSize: "11px", ...S.mid, lineHeight: "1.5" }}>{v}</div>
                </div>
              ))}
            </div>
            <div>
              {Object.entries(scan.tension || {}).map(([k, v]) => (
                <div key={k} style={{ marginBottom: "8px" }}>
                  <div style={{ ...S.label, fontSize: "8px", marginBottom: "2px" }}>
                    {k.replace(/([A-Z])/g, " $1").toUpperCase()}
                  </div>
                  <div style={{ fontSize: "11px", ...S.mid, lineHeight: "1.5" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              marginTop: "12px",
              padding: "10px 14px",
              background: "rgba(0,0,0,0.2)",
              borderRadius: "3px",
              borderLeft: "2px solid rgba(232,228,222,0.2)",
            }}
          >
            <div style={{ ...S.label, fontSize: "8px", marginBottom: "4px" }}>HANDLE</div>
            <div style={{ fontSize: "13px", ...S.bright, lineHeight: "1.6", fontStyle: "italic" }}>
              "{scan.handle}"
            </div>
          </div>
        </div>
      )}

      {arc && (
        <div style={{ ...S.card, animation: "fadeIn 0.4s ease" }}>
          <div style={S.cardHead}>EMOTIONAL ARC — {(arc.shape || "").toUpperCase()}</div>
          <div style={{ display: "flex", gap: "24px", marginBottom: "16px", flexWrap: "wrap" }}>
            {[
              ["OPENING", arc.openingState],
              ["FLOOR", arc.floor],
              ["PIVOT", arc.pivotImage],
              ["TERMINAL", arc.terminalState],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ ...S.label, fontSize: "8px", marginBottom: "2px" }}>{label}</div>
                <div
                  style={{
                    fontSize: "12px",
                    color: label === "PIVOT" ? "#e8e4de" : "rgba(232,228,222,0.5)",
                    fontWeight: label === "PIVOT" ? 600 : 400,
                  }}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* Beat timeline */}
          <div style={{ position: "relative", padding: "8px 0 0", marginBottom: "8px" }}>
            <div
              style={{
                height: "1px",
                background: "rgba(232,228,222,0.08)",
                position: "absolute",
                top: "14px",
                left: 0,
                right: 0,
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
              {(arc.beats || []).map((b, i) => {
                const isPivot = Math.abs(b.position - arc.pivotPosition) < 0.05;
                return (
                  <div
                    key={i}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}
                  >
                    <div
                      style={{
                        width: isPivot ? "10px" : "6px",
                        height: isPivot ? "10px" : "6px",
                        borderRadius: "50%",
                        background: isPivot ? "#e8e4de" : "rgba(232,228,222,0.2)",
                        border: isPivot ? "2px solid rgba(232,228,222,0.4)" : "none",
                        marginBottom: "6px",
                        position: "relative",
                        zIndex: 1,
                      }}
                    />
                    <div
                      style={{
                        ...S.mono,
                        fontSize: "8px",
                        letterSpacing: "1px",
                        color: isPivot ? "#e8e4de" : "rgba(232,228,222,0.3)",
                        textTransform: "uppercase",
                        textAlign: "center",
                        lineHeight: "1.3",
                      }}
                    >
                      {b.feeling}
                      {isPivot && (
                        <div style={{ fontSize: "7px", marginTop: "2px", letterSpacing: "2px" }}>
                          ◆ PIVOT
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {validate && (
        <div style={{ ...S.card, animation: "fadeIn 0.4s ease" }}>
          <div style={S.cardHead}>VALIDATION REPORT</div>
          <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ ...S.label, fontSize: "8px" }}>SHOTS</div>
              <div style={{ fontSize: "18px", ...S.bright }}>{validate.shots?.length || 0}</div>
            </div>
            <div>
              <div style={{ ...S.label, fontSize: "8px" }}>AVG SCORE</div>
              <div
                style={{
                  fontSize: "18px",
                  color:
                    (validate.validations || []).reduce((a, v) => a + v.score, 0) /
                      Math.max(1, (validate.validations || []).length) >=
                    75
                      ? "#5a9a6a"
                      : "#b89c4a",
                }}
              >
                {Math.round(
                  (validate.validations || []).reduce((a, v) => a + v.score, 0) /
                    Math.max(1, (validate.validations || []).length)
                )}
              </div>
            </div>
            <div>
              <div style={{ ...S.label, fontSize: "8px" }}>CREDITS EST.</div>
              <div style={{ fontSize: "18px", ...S.bright }}>
                {estimateCredits(validate.shots).toLocaleString()}
              </div>
            </div>
            {validate.fixed > 0 && (
              <div>
                <div style={{ ...S.label, fontSize: "8px" }}>AUTO-FIXED</div>
                <div style={{ fontSize: "18px", color: "#b89c4a" }}>{validate.fixed}</div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {(validate.shots || []).map((s, i) => {
              const v = validate.validations?.[i] || { score: 0, wordCount: 0, issues: [] };
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "6px 10px",
                    background: "rgba(0,0,0,0.15)",
                    borderRadius: "2px",
                    borderLeft: `2px solid ${
                      v.score >= 75
                        ? "rgba(90,154,106,0.4)"
                        : v.score >= 50
                        ? "rgba(184,156,74,0.4)"
                        : "rgba(192,86,74,0.4)"
                    }`,
                  }}
                >
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim, width: "20px" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ ...S.mono, fontSize: "10px", ...S.mid, flex: "0 0 120px" }}>
                    {s.name}
                  </span>
                  <span
                    style={{
                      ...S.mono,
                      fontSize: "9px",
                      width: "32px",
                      color:
                        v.score >= 75 ? "#5a9a6a" : v.score >= 50 ? "#b89c4a" : "#c0564a",
                    }}
                  >
                    {v.score}
                  </span>
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim, width: "28px" }}>
                    {v.wordCount}w
                  </span>
                  <span
                    style={{
                      ...S.mono,
                      fontSize: "9px",
                      ...S.dim,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {v.issues.length === 0
                      ? "✓ all checks pass"
                      : v.issues.map((x) => x.msg).join(" · ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
