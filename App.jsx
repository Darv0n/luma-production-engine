import { useState, useEffect } from "react";
import { S, GLOBAL_CSS } from "./src/styles/theme.js";
import { runPipeline, rerunShot } from "./src/lib/pipeline.js";
import { validatePrompt } from "./src/lib/validator.js";
import { estimateCredits } from "./src/lib/credits.js";
import { buildFullSchema } from "./src/lib/schema-builder.js";
import { storage } from "./src/store/storage.js";
import { createProject, createRun, latestRun, appendRun } from "./src/store/project-model.js";
import PipelineProgress from "./src/components/PipelineProgress.jsx";
import LiveResults from "./src/components/LiveResults.jsx";
import SchemaOutput from "./src/components/SchemaOutput.jsx";
import ProjectSidebar from "./src/components/ProjectSidebar.jsx";

export default function App() {
  // ─── Pipeline inputs ────────────────────────────────────────────────────────
  const [concept, setConcept] = useState("");
  const [format, setFormat] = useState("30s");
  const [product, setProduct] = useState("");
  const [targetDuration, setTargetDuration] = useState("30 seconds");

  // ─── Pipeline state ─────────────────────────────────────────────────────────
  const [pipelineStage, setPipelineStage] = useState("idle");
  const [stageData, setStageData] = useState({});
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  // ─── Shot-level re-run ──────────────────────────────────────────────────────
  const [rerunningShot, setRerunningShot] = useState(-1);

  // ─── Project management ─────────────────────────────────────────────────────
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ─── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    setProjects(storage.getProjects());
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const refreshProjects = () => setProjects(storage.getProjects());

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  // ─── Pipeline run ────────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!concept.trim() || running) return;

    // Capture project ID at run start (avoids closure stale state)
    const projectIdAtStart = activeProjectId;

    setRunning(true);
    setError(null);
    setFinalResult(null);
    setStageData({});
    setPipelineStage("scan");

    // Local stage data capture — avoids React batch timing issues
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
        { characters: activeProject?.characters || [] }
      );

      setFinalResult(result);
      autoSave(result, capturedStageData, projectIdAtStart);
    } catch (e) {
      console.error("Pipeline error:", e);
      setError(e.message || "Pipeline failed. Check console.");
    }

    setRunning(false);
  };

  // ─── Auto-save after pipeline run ────────────────────────────────────────────
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
        setActiveProjectId(newProject.id);
      } else {
        storage.addRun(projectIdAtStart, run);
      }
      refreshProjects();
    } catch (e) {
      // Storage quota or corruption — non-fatal
      console.error("Auto-save failed:", e.message);
      if (e.message.includes("quota")) {
        setError("Storage quota exceeded. Delete old projects to continue saving.");
      }
    }
  };

  // ─── Shot-level re-run ───────────────────────────────────────────────────────
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

      // Append as a new run (frozen context preserved — P12)
      if (activeProjectId) {
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
        storage.addRun(activeProjectId, run);
        refreshProjects();
      }
    } catch (e) {
      console.error("Shot rerun failed:", e);
      // Non-fatal — show inline error but don't replace full error state
    }

    setRerunningShot(-1);
  };

  // ─── Manual shot edit ────────────────────────────────────────────────────────
  const handleUpdateShot = (idx, updatedShot) => {
    if (!finalResult) return;
    const newShots = finalResult.shots.map((s, i) => (i === idx ? updatedShot : s));
    const newValidations = newShots.map((s) => validatePrompt(s.prompt));
    setFinalResult({ ...finalResult, shots: newShots, validations: newValidations });
  };

  // ─── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setConcept("");
    setProduct("");
    setPipelineStage("idle");
    setStageData({});
    setFinalResult(null);
    setError(null);
    setRunning(false);
  };

  // ─── Load project ────────────────────────────────────────────────────────────
  const handleLoadProject = (id) => {
    const project = storage.getProject(id);
    if (!project) return;

    setActiveProjectId(id);
    setConcept(project.inputs.concept);
    setFormat(project.inputs.format);
    setProduct(project.inputs.product);
    setTargetDuration(project.inputs.targetDuration);
    setError(null);
    setRunning(false);
    setPipelineStage("idle");

    const latest = latestRun(project);
    if (latest) {
      setFinalResult({
        analysis: latest.stageData.scan,
        arcData: latest.stageData.arc,
        shots: latest.shots,
        validations: latest.validations,
      });
      setStageData({
        scan: latest.stageData.scan,
        arc: latest.stageData.arc,
      });
    } else {
      setFinalResult(null);
      setStageData({});
    }
  };

  // ─── New project ─────────────────────────────────────────────────────────────
  const handleNewProject = () => {
    setActiveProjectId(null);
    handleReset();
  };

  // ─── Rename ──────────────────────────────────────────────────────────────────
  const handleRename = (id, name) => {
    const p = storage.getProject(id);
    if (!p) return;
    storage.saveProject({ ...p, name, updatedAt: new Date().toISOString() });
    refreshProjects();
  };

  // ─── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = (id) => {
    storage.deleteProject(id);
    if (activeProjectId === id) {
      setActiveProjectId(null);
      handleReset();
    }
    refreshProjects();
  };

  // ─── Characters (Phase 2D) ───────────────────────────────────────────────────
  const handleAddCharacter = (projectId, char) => {
    const p = storage.getProject(projectId);
    if (!p) return;
    const already = (p.characters || []).some((c) => c.name === char.name);
    if (already) return;
    storage.saveProject({
      ...p,
      characters: [...(p.characters || []), char],
      updatedAt: new Date().toISOString(),
    });
    refreshProjects();
  };

  const handleRemoveCharacter = (projectId, charName) => {
    const p = storage.getProject(projectId);
    if (!p) return;
    storage.saveProject({
      ...p,
      characters: (p.characters || []).filter((c) => c.name !== charName),
      updatedAt: new Date().toISOString(),
    });
    refreshProjects();
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0c0c0c", color: "#e8e4de", ...S.mono }}>

      {/* Sidebar toggle button */}
      <button
        onClick={() => setSidebarOpen((o) => !o)}
        style={{
          position: "fixed",
          top: "20px",
          left: sidebarOpen ? "228px" : "8px",
          zIndex: 100,
          ...S.btnSec,
          padding: "4px 7px",
          fontSize: "10px",
          border: "1px solid rgba(232,228,222,0.06)",
          background: "#0c0c0c",
          transition: "left 0.2s ease",
        }}
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? "◂" : "▸"}
      </button>

      {/* Sidebar */}
      <div
        style={{
          width: sidebarOpen ? "220px" : "0",
          overflow: "hidden",
          transition: "width 0.2s ease",
          flexShrink: 0,
        }}
      >
        <ProjectSidebar
          projects={projects}
          activeId={activeProjectId}
          onLoad={handleLoadProject}
          onNew={handleNewProject}
          onRename={handleRename}
          onDelete={handleDelete}
          onAddCharacter={handleAddCharacter}
          onRemoveCharacter={handleRemoveCharacter}
        />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>

          {/* Header */}
          <div style={{ marginBottom: "32px", paddingLeft: sidebarOpen ? "0" : "28px", transition: "padding 0.2s" }}>
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
                {activeProject && (
                  <span style={{ ...S.mono, fontSize: "9px", ...S.dim }}>
                    {activeProject.name}
                  </span>
                )}
                {finalResult && (
                  <button onClick={handleReset} style={{ ...S.btnSec, fontSize: "9px" }}>
                    ↺ NEW RUN
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: "9px", ...S.dim, letterSpacing: "1.5px", marginTop: "8px" }}>
              DROP CONCEPT → SCAN → TENSION → ARC → SHOTS → VALIDATE → ⧑
            </div>
          </div>

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

              {/* Character hint (shown if active project has registered characters) */}
              {activeProject && (activeProject.characters || []).length > 0 && (
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
                  Characters: {activeProject.characters.map((c) => `@${c.name}`).join(", ")} — will be passed to shot generation
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
                  {activeProject && (
                    <span style={{ ...S.dim }}>
                      {" "}· {activeProject.runs.length} run{activeProject.runs.length !== 1 ? "s" : ""} saved
                    </span>
                  )}
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
                    <strong style={{ color: "#e8e4de" }}>
                      {finalResult.arcData?.pivotImage}
                    </strong>{" "}
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
      </div>
    </div>
  );
}
