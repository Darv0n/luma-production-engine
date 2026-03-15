import { useState, useEffect } from "react";
import { useParams, useNavigate, useOutletContext, Link } from "react-router-dom";
import { S } from "../styles/theme.js";
import { runPipeline, rerunShot } from "../lib/pipeline.js";
import { validatePrompt } from "../lib/validator.js";
import { estimateCredits } from "../lib/credits.js";
import { buildFullSchema } from "../lib/schema-builder.js";
import { storage } from "../store/storage.js";
import { createProject, createRun, latestRun } from "../store/project-model.js";
import PipelineProgress from "../components/PipelineProgress.jsx";
import LiveResults from "../components/LiveResults.jsx";
import SchemaOutput from "../components/SchemaOutput.jsx";

export default function ProjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useOutletContext();

  // ─── Pipeline inputs ──────────────────────────────────────────────────────
  const [concept, setConcept] = useState("");
  const [format, setFormat] = useState("30s");
  const [product, setProduct] = useState("");
  const [targetDuration, setTargetDuration] = useState("30 seconds");

  // ─── Pipeline state ───────────────────────────────────────────────────────
  const [pipelineStage, setPipelineStage] = useState("idle");
  const [stageData, setStageData] = useState({});
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [rerunningShot, setRerunningShot] = useState(-1);

  // ─── Project display state (derived from storage, for header) ─────────────
  const [projectName, setProjectName] = useState(null);
  const [runCount, setRunCount] = useState(0);

  // ─── Load project on route change ────────────────────────────────────────
  useEffect(() => {
    if (!id || id === "new") {
      // Blank workspace
      setConcept("");
      setFormat("30s");
      setProduct("");
      setTargetDuration("30 seconds");
      setPipelineStage("idle");
      setStageData({});
      setFinalResult(null);
      setError(null);
      setProjectName(null);
      setRunCount(0);
      return;
    }

    const project = storage.getProject(id);
    if (!project) {
      navigate("/projects", { replace: true });
      return;
    }

    setConcept(project.inputs.concept);
    setFormat(project.inputs.format);
    setProduct(project.inputs.product);
    setTargetDuration(project.inputs.targetDuration);
    setProjectName(project.name);
    setRunCount(project.runs?.length || 0);
    setError(null);
    setPipelineStage("idle");

    const latest = latestRun(project);
    if (latest) {
      setFinalResult({
        analysis: latest.stageData.scan,
        arcData: latest.stageData.arc,
        shots: latest.shots,
        validations: latest.validations,
      });
      setStageData({ scan: latest.stageData.scan, arc: latest.stageData.arc });
    } else {
      setFinalResult(null);
      setStageData({});
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Current project's characters ─────────────────────────────────────────
  const activeProject = id && id !== "new" ? storage.getProject(id) : null;
  const characters = activeProject?.characters || [];

  // ─── Pipeline run ─────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!concept.trim() || running) return;

    const projectIdAtStart = id && id !== "new" ? id : null;

    setRunning(true);
    setError(null);
    setFinalResult(null);
    setStageData({});
    setPipelineStage("scan");

    const capturedStageData = {};

    try {
      const result = await runPipeline(
        concept,
        format,
        product,
        targetDuration,
        (stage, data) => {
          setPipelineStage(stage);
          if (data) {
            setStageData((prev) => ({ ...prev, [stage]: data }));
            capturedStageData[stage] = data;
          }
        },
        { characters }
      );

      setFinalResult(result);
      autoSave(result, capturedStageData, projectIdAtStart);
    } catch (e) {
      console.error("Pipeline error:", e);
      setError(e.message || "Pipeline failed. Check console.");
    }

    setRunning(false);
  };

  // ─── Auto-save ────────────────────────────────────────────────────────────
  const autoSave = (result, capturedStageData, projectIdAtStart) => {
    try {
      const schema = buildFullSchema(
        concept, format, product, targetDuration,
        result.analysis, result.arcData, result.shots, result.validations
      );
      const run = createRun(
        { scan: capturedStageData.scan, arc: capturedStageData.arc },
        result.shots,
        result.validations,
        schema
      );

      if (!projectIdAtStart) {
        const newProject = createProject({ concept, format, product, targetDuration });
        storage.saveProject(newProject);
        storage.addRun(newProject.id, run);
        setProjectName(newProject.name);
        setRunCount(1);
        refresh();
        navigate(`/projects/${newProject.id}`, { replace: true });
      } else {
        storage.addRun(projectIdAtStart, run);
        const updated = storage.getProject(projectIdAtStart);
        setRunCount(updated?.runs?.length || 0);
        refresh();
      }
    } catch (e) {
      console.error("Auto-save failed:", e.message);
      if (e.message.includes("quota")) {
        setError("Storage quota exceeded. Delete old projects to continue saving.");
      }
    }
  };

  // ─── Shot-level re-run (P12) ──────────────────────────────────────────────
  const handleRerunShot = async (beatIndex) => {
    if (!finalResult || rerunningShot >= 0) return;
    setRerunningShot(beatIndex);

    try {
      const frozenScan = stageData.scan || finalResult.analysis;
      const frozenArc = stageData.arc || finalResult.arcData;

      const { shot, validation } = await rerunShot(
        beatIndex, frozenScan, frozenArc, concept, format, product
      );

      const newShots = finalResult.shots.map((s, i) => (i === beatIndex ? shot : s));
      const newValidations = finalResult.validations.map((v, i) =>
        i === beatIndex ? validation : v
      );
      const newResult = { ...finalResult, shots: newShots, validations: newValidations };
      setFinalResult(newResult);

      const currentId = id && id !== "new" ? id : null;
      if (currentId) {
        const schema = buildFullSchema(
          concept, format, product, targetDuration,
          newResult.analysis, newResult.arcData, newShots, newValidations
        );
        const run = createRun(
          { scan: frozenScan, arc: frozenArc },
          newShots,
          newValidations,
          schema
        );
        storage.addRun(currentId, run);
        const updated = storage.getProject(currentId);
        setRunCount(updated?.runs?.length || 0);
        refresh();
      }
    } catch (e) {
      console.error("Shot rerun failed:", e);
    }

    setRerunningShot(-1);
  };

  // ─── Manual shot edit ─────────────────────────────────────────────────────
  const handleUpdateShot = (idx, updatedShot) => {
    if (!finalResult) return;
    const newShots = finalResult.shots.map((s, i) => (i === idx ? updatedShot : s));
    const newValidations = newShots.map((s) => validatePrompt(s.prompt));
    setFinalResult({ ...finalResult, shots: newShots, validations: newValidations });
  };

  // ─── Reset to re-run on same project ─────────────────────────────────────
  const handleNewRun = () => {
    setPipelineStage("idle");
    setStageData({});
    setFinalResult(null);
    setError(null);
    setRunning(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
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
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {projectName && (
              <span style={{ ...S.mono, fontSize: "9px", ...S.dim }}>
                {projectName}
                {runCount > 0 && (
                  <span> · {runCount} run{runCount !== 1 ? "s" : ""}</span>
                )}
              </span>
            )}
            {finalResult && (
              <button onClick={handleNewRun} style={{ ...S.btnSec, fontSize: "9px" }}>
                ↺ NEW RUN
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: "9px", ...S.dim, letterSpacing: "1.5px", marginTop: "8px" }}>
          DROP CONCEPT → SCAN → TENSION → ARC → SHOTS → VALIDATE → ⧑
        </div>
      </div>

      {/* Run history link (when project has multiple runs) */}
      {id && id !== "new" && runCount > 1 && (
        <div style={{ marginBottom: "16px" }}>
          <Link
            to={`/projects/${id}/runs`}
            style={{
              ...S.mono,
              fontSize: "9px",
              color: "rgba(232,228,222,0.3)",
              letterSpacing: "1px",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.target.style.color = "rgba(232,228,222,0.6)")}
            onMouseLeave={(e) => (e.target.style.color = "rgba(232,228,222,0.3)")}
          >
            VIEW RUN HISTORY ({runCount} runs) →
          </Link>
        </div>
      )}

      {/* Input form */}
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

          {characters.length > 0 && (
            <div
              style={{
                ...S.mono,
                fontSize: "9px",
                ...S.dim,
                marginBottom: "12px",
                padding: "6px 10px",
                background: "rgba(232,228,222,0.02)",
                borderRadius: "2px",
                borderLeft: "2px solid rgba(232,228,222,0.08)",
              }}
            >
              Characters: {characters.map((c) => `@${c.name}`).join(", ")} — passed to shot generation
            </div>
          )}

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

      {/* Error */}
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
          <div style={{ ...S.mono, fontSize: "11px", color: "#c0564a", lineHeight: "1.5", flex: 1 }}>
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

      {/* Pipeline progress */}
      {pipelineStage !== "idle" && !finalResult && (
        <PipelineProgress currentStage={pipelineStage} stageData={stageData} />
      )}

      {/* Live results */}
      {!finalResult && Object.keys(stageData).length > 0 && (
        <LiveResults stageData={stageData} />
      )}

      {/* Final schema */}
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
              <div style={{ fontSize: "13px", ...S.bright, fontStyle: "italic", lineHeight: "1.6" }}>
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

          <SchemaOutput
            result={finalResult}
            onUpdateShot={handleUpdateShot}
            onRerunShot={handleRerunShot}
            rerunningShot={rerunningShot}
            concept={concept}
            format={format}
            product={product}
            targetDuration={targetDuration}
          />
        </div>
      )}
    </div>
  );
}
