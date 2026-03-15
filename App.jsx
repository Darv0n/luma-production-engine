import { useState, useEffect } from "react";
import { S, GLOBAL_CSS } from "./src/styles/theme.js";
import { runPipeline } from "./src/lib/pipeline.js";
import { validatePrompt } from "./src/lib/validator.js";
import { estimateCredits } from "./src/lib/credits.js";
import PipelineProgress from "./src/components/PipelineProgress.jsx";
import LiveResults from "./src/components/LiveResults.jsx";
import SchemaOutput from "./src/components/SchemaOutput.jsx";

export default function App() {
  const [concept, setConcept] = useState("");
  const [format, setFormat] = useState("30s");
  const [product, setProduct] = useState("");
  const [targetDuration, setTargetDuration] = useState("30 seconds");
  const [pipelineStage, setPipelineStage] = useState("idle");
  const [stageData, setStageData] = useState({});
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  // Inject global CSS once
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const handleRun = async () => {
    if (!concept.trim() || running) return;
    setRunning(true);
    setError(null);
    setFinalResult(null);
    setStageData({});
    setPipelineStage("scan");

    try {
      const result = await runPipeline(
        concept,
        format,
        product,
        targetDuration,
        (stage, data) => {
          setPipelineStage(stage);
          if (data) setStageData((prev) => ({ ...prev, [stage]: data }));
        }
      );
      setFinalResult(result);
    } catch (e) {
      console.error("Pipeline error:", e);
      setError(e.message || "Pipeline failed. Check console.");
    }
    setRunning(false);
  };

  const handleUpdateShot = (idx, updatedShot) => {
    if (!finalResult) return;
    const newShots = finalResult.shots.map((s, i) => (i === idx ? updatedShot : s));
    const newValidations = newShots.map((s) => validatePrompt(s.prompt));
    setFinalResult({ ...finalResult, shots: newShots, validations: newValidations });
  };

  const handleReset = () => {
    setConcept("");
    setProduct("");
    setPipelineStage("idle");
    setStageData({});
    setFinalResult(null);
    setError(null);
    setRunning(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c0c", color: "#e8e4de", ...S.mono }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "6px", ...S.dim, marginBottom: "4px" }}>
                LUMA DREAM MACHINE
              </div>
              <div
                style={{
                  fontSize: "18px",
                  letterSpacing: "5px",
                  color: "rgba(232,228,222,0.7)",
                  fontWeight: 300,
                }}
              >
                PRODUCTION ENGINE
              </div>
            </div>
            {finalResult && (
              <button onClick={handleReset} style={{ ...S.btnSec, fontSize: "9px" }}>
                ↺ NEW CONCEPT
              </button>
            )}
          </div>
          <div
            style={{
              fontSize: "9px",
              ...S.dim,
              letterSpacing: "1.5px",
              marginTop: "8px",
            }}
          >
            DROP CONCEPT → SCAN → TENSION → ARC → SHOTS → VALIDATE → ⧑
          </div>
        </div>

        {/* Input (hidden once result is ready) */}
        {!finalResult && (
          <div style={{ ...S.card, marginBottom: "24px", animation: "fadeIn 0.3s ease" }}>
            <textarea
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              disabled={running}
              placeholder={
                "Drop your concept here. Raw, unstructured, stream-of-consciousness — the engine refines.\n\nWhat is this piece? What should the audience feel? Who is it for? What's the one image that makes it unforgettable?"
              }
              style={{
                ...S.input,
                minHeight: "120px",
                border: "none",
                background: "transparent",
                fontSize: "13px",
                lineHeight: "1.7",
                padding: "0",
                marginBottom: "16px",
                color: "#e8e4de",
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div>
                <div style={S.label}>FORMAT</div>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  disabled={running}
                  style={S.input}
                >
                  <option value="15s">15s spot</option>
                  <option value="30s">30s spot</option>
                  <option value="60s">60s spot</option>
                  <option value="social">Social (9:16)</option>
                  <option value="cinematic">Cinematic short</option>
                  <option value="product">Product showcase</option>
                </select>
              </div>
              <div>
                <div style={S.label}>TARGET DURATION</div>
                <input
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(e.target.value)}
                  disabled={running}
                  placeholder="e.g. 30 seconds"
                  style={S.input}
                />
              </div>
              <div>
                <div style={S.label}>PRODUCT (if commercial)</div>
                <input
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  disabled={running}
                  placeholder="What's being advertised?"
                  style={S.input}
                />
              </div>
            </div>

            <button
              onClick={handleRun}
              disabled={!concept.trim() || running}
              style={{
                ...S.btnPrimary,
                fontSize: "12px",
                letterSpacing: "3px",
                padding: "16px",
                background: running ? "transparent" : "rgba(232,228,222,0.06)",
                borderColor: running ? "rgba(232,228,222,0.1)" : "rgba(232,228,222,0.2)",
              }}
            >
              {running ? (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      border: "1.5px solid rgba(232,228,222,0.3)",
                      borderTopColor: "#e8e4de",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  PIPELINE RUNNING
                </span>
              ) : (
                "⧑ RUN PRODUCTION PIPELINE"
              )}
            </button>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(192,86,74,0.08)",
              border: "1px solid rgba(192,86,74,0.2)",
              borderRadius: "3px",
              marginBottom: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                ...S.mono,
                fontSize: "11px",
                color: "#c0564a",
                lineHeight: "1.5",
                flex: 1,
              }}
            >
              ✗ {error}
            </div>
            <button
              onClick={handleRun}
              style={{
                ...S.btnSec,
                borderColor: "rgba(192,86,74,0.3)",
                color: "#c0564a",
                whiteSpace: "nowrap",
                fontSize: "9px",
              }}
            >
              ↻ RETRY
            </button>
          </div>
        )}

        {/* Pipeline progress (during run) */}
        {pipelineStage !== "idle" && !finalResult && (
          <PipelineProgress currentStage={pipelineStage} stageData={stageData} />
        )}

        {/* Live results (during run) */}
        {!finalResult && Object.keys(stageData).length > 0 && (
          <LiveResults stageData={stageData} />
        )}

        {/* Final schema output */}
        {finalResult && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <div
              style={{
                textAlign: "center",
                padding: "20px 0 28px",
                borderBottom: "1px solid rgba(232,228,222,0.06)",
                marginBottom: "24px",
              }}
            >
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>⧑</div>
              <div style={{ ...S.mono, fontSize: "10px", letterSpacing: "4px", ...S.dim }}>
                PRODUCTION SCHEMA READY
              </div>
              <div style={{ ...S.mono, fontSize: "11px", ...S.mid, marginTop: "8px" }}>
                {finalResult.shots?.length} shots ·{" "}
                {estimateCredits(finalResult.shots).toLocaleString()} credits est.
              </div>
            </div>

            {/* Analysis summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div style={S.card}>
                <div style={S.cardHead}>HANDLE</div>
                <div
                  style={{
                    fontSize: "13px",
                    ...S.bright,
                    fontStyle: "italic",
                    lineHeight: "1.6",
                  }}
                >
                  "{finalResult.analysis?.handle}"
                </div>
              </div>
              <div style={S.card}>
                <div style={S.cardHead}>
                  ARC: {(finalResult.arcData?.shape || "").toUpperCase()}
                </div>
                <div style={{ fontSize: "11px", ...S.mid, lineHeight: "1.6" }}>
                  {finalResult.arcData?.openingState} → {finalResult.arcData?.floor} →{" "}
                  <strong style={{ color: "#e8e4de" }}>{finalResult.arcData?.pivotImage}</strong>{" "}
                  → {finalResult.arcData?.terminalState}
                </div>
              </div>
            </div>

            <SchemaOutput result={finalResult} onUpdateShot={handleUpdateShot} />
          </div>
        )}
      </div>
    </div>
  );
}
