import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { S, COLORS } from "../styles/theme.js";
import { storage } from "../store/storage.js";
import { validatePrompt } from "../lib/validator.js";
import { estimateCredits } from "../lib/credits.js";
import { buildFullSchema } from "../lib/schema-builder.js";

// ─── Download helpers ─────────────────────────────────────────────────────────
function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Arc summary card ─────────────────────────────────────────────────────────
function ArcCard({ arcData }) {
  if (!arcData) return null;
  return (
    <div style={{ ...S.card }}>
      <div style={S.cardHead}>ARC: {(arcData.shape || "").toUpperCase()}</div>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "12px" }}>
        {[
          ["OPENING", arcData.openingState],
          ["FLOOR", arcData.floor],
          ["PIVOT", arcData.pivotImage],
          ["TERMINAL", arcData.terminalState],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ ...S.label, fontSize: "7px", marginBottom: "2px" }}>{label}</div>
            <div
              style={{
                ...S.mono,
                fontSize: "10px",
                color: label === "PIVOT" ? COLORS.textBright : COLORS.textMid,
                fontWeight: label === "PIVOT" ? 600 : 400,
              }}
            >
              {val || "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shot row for comparison ──────────────────────────────────────────────────
function ShotRow({ shot, validation, changed, missing, side }) {
  if (missing) {
    return (
      <div
        style={{
          ...S.card,
          padding: "10px 14px",
          opacity: 0.3,
          borderLeft: "2px solid rgba(232,228,222,0.1)",
        }}
      >
        <div style={{ ...S.mono, fontSize: "9px", ...S.dim }}>— not present in this run —</div>
      </div>
    );
  }

  const v = validation || { score: 0, wordCount: 0 };
  return (
    <div
      style={{
        ...S.card,
        padding: "10px 14px",
        borderLeft: `2px solid ${
          changed
            ? "rgba(184,156,74,0.5)"
            : v.score >= 75
            ? "rgba(90,154,106,0.3)"
            : v.score >= 50
            ? "rgba(184,156,74,0.3)"
            : "rgba(192,86,74,0.3)"
        }`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
          <span style={{ ...S.mono, fontSize: "9px", ...S.dim }}>{String((shot.beatIndex ?? 0) + 1).padStart(2, "0")}</span>
          <span style={{ ...S.mono, fontSize: "11px", ...S.bright }}>{shot.name}</span>
          {changed && (
            <span style={{ ...S.mono, fontSize: "8px", color: "#b89c4a", letterSpacing: "1px" }}>
              CHANGED
            </span>
          )}
        </div>
        <span
          style={{
            ...S.mono,
            fontSize: "9px",
            color: v.score >= 75 ? "#5a9a6a" : v.score >= 50 ? "#b89c4a" : "#c0564a",
          }}
        >
          {v.score}/100
        </span>
      </div>
      <div
        style={{
          ...S.mono,
          fontSize: "10px",
          color: "rgba(232,228,222,0.6)",
          lineHeight: "1.6",
          padding: "6px 8px",
          background: "rgba(0,0,0,0.2)",
          borderRadius: "2px",
        }}
      >
        {shot.prompt}
      </div>
      <div style={{ ...S.mono, fontSize: "8px", ...S.dim, marginTop: "4px" }}>
        {shot.model} · {shot.mode} · {shot.aspect} · {shot.duration}
      </div>
    </div>
  );
}

// ─── Run comparison (two columns) ─────────────────────────────────────────────
function RunComparison({ runA, runB }) {
  const maxLen = Math.max(runA.shots?.length || 0, runB.shots?.length || 0);

  return (
    <div>
      {/* Arc comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
        <ArcCard arcData={runA.stageData?.arc} />
        <ArcCard arcData={runB.stageData?.arc} />
      </div>

      {/* Shot comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {Array.from({ length: maxLen }).map((_, i) => {
          const shotA = runA.shots?.[i];
          const shotB = runB.shots?.[i];
          const changed = !!shotA && !!shotB && shotA.prompt !== shotB.prompt;

          return (
            <div key={`shot-${i}`} style={{ display: "contents" }}>
              <ShotRow
                shot={shotA}
                validation={runA.validations?.[i]}
                changed={changed}
                missing={!shotA}
                side="a"
              />
              <ShotRow
                shot={shotB}
                validation={runB.validations?.[i]}
                changed={changed}
                missing={!shotB}
                side="b"
              />
            </div>
          );
        })}
      </div>

      {/* Diff summary */}
      {(() => {
        const changed = Array.from({ length: maxLen }).filter((_, i) => {
          const sA = runA.shots?.[i];
          const sB = runB.shots?.[i];
          return sA && sB && sA.prompt !== sB.prompt;
        }).length;
        if (changed === 0) return null;
        return (
          <div
            style={{
              ...S.mono,
              fontSize: "9px",
              color: "#b89c4a",
              marginTop: "16px",
              padding: "8px 12px",
              background: "rgba(184,156,74,0.05)",
              border: "1px solid rgba(184,156,74,0.15)",
              borderRadius: "3px",
            }}
          >
            {changed} shot{changed !== 1 ? "s" : ""} changed between these runs
          </div>
        );
      })()}
    </div>
  );
}

// ─── Main RunView page ────────────────────────────────────────────────────────
export default function RunView() {
  const { id, runId } = useParams();
  const navigate = useNavigate();
  const [compareRunId, setCompareRunId] = useState("");

  const project = storage.getProject(id);
  if (!project) {
    navigate("/projects", { replace: true });
    return null;
  }

  // Support `/projects/:id/runs` (no runId) → show latest run
  const targetRunId = runId || project.runs?.[project.runs.length - 1]?.id;
  const thisRun = project.runs?.find((r) => r.id === targetRunId);

  if (!thisRun) {
    return (
      <div style={{ padding: "40px 24px", maxWidth: "960px", margin: "0 auto" }}>
        <div style={{ ...S.mono, fontSize: "12px", ...S.dim }}>Run not found.</div>
        <Link to={`/projects/${id}`} style={{ ...S.mono, fontSize: "9px", color: COLORS.textDim }}>
          ← back to project
        </Link>
      </div>
    );
  }

  const compareRun = compareRunId ? project.runs?.find((r) => r.id === compareRunId) : null;
  const otherRuns = project.runs?.filter((r) => r.id !== thisRun.id) || [];

  // Build read-only finalResult shape for single-run display
  const singleResult = {
    analysis: thisRun.stageData?.scan,
    arcData: thisRun.stageData?.arc,
    shots: thisRun.shots || [],
    validations: thisRun.validations || [],
  };

  const schema = buildFullSchema(
    project.inputs.concept,
    project.inputs.format,
    project.inputs.product,
    project.inputs.targetDuration,
    singleResult.analysis,
    singleResult.arcData,
    singleResult.shots,
    singleResult.validations
  );

  const handleDownloadSchema = () => {
    downloadBlob(schema, `luma-schema-${thisRun.id}.txt`, "text/plain");
  };

  const handleDownloadJSON = () => {
    downloadBlob(
      JSON.stringify(thisRun.shots, null, 2),
      `luma-shots-${thisRun.id}.json`,
      "application/json"
    );
  };

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <Link
          to={`/projects/${id}`}
          style={{ ...S.mono, fontSize: "9px", color: COLORS.textDim, textDecoration: "none", letterSpacing: "1px" }}
          onMouseEnter={(e) => (e.target.style.color = COLORS.textMid)}
          onMouseLeave={(e) => (e.target.style.color = COLORS.textDim)}
        >
          ← {project.name}
        </Link>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "12px" }}>
          <div>
            <div style={{ ...S.mono, fontSize: "9px", letterSpacing: "3px", ...S.dim, marginBottom: "4px" }}>
              RUN
            </div>
            <div style={{ ...S.mono, fontSize: "14px", color: COLORS.textMid }}>
              {new Date(thisRun.createdAt).toLocaleString()}
            </div>
            <div style={{ ...S.mono, fontSize: "9px", ...S.dim, marginTop: "4px" }}>
              {thisRun.shots?.length || 0} shots ·{" "}
              {estimateCredits(thisRun.shots || []).toLocaleString()} credits est.
            </div>
          </div>

          {/* Export + compare controls */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {otherRuns.length > 0 && (
              <select
                value={compareRunId}
                onChange={(e) => setCompareRunId(e.target.value)}
                style={{ ...S.input, width: "auto", fontSize: "9px", padding: "6px 28px 6px 10px" }}
              >
                <option value="">Compare with…</option>
                {otherRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.createdAt).toLocaleString()} ({r.shots?.length || 0} shots)
                  </option>
                ))}
              </select>
            )}
            <button onClick={handleDownloadJSON} style={{ ...S.btnSec, fontSize: "9px", padding: "6px 12px" }}>
              ↓ JSON
            </button>
            <button onClick={handleDownloadSchema} style={{ ...S.btnSec, fontSize: "9px", padding: "6px 12px" }}>
              ↓ .TXT
            </button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "rgba(232,228,222,0.06)", marginBottom: "24px" }} />

      {/* Single run view or comparison */}
      {compareRun ? (
        <div>
          {/* Comparison header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            {[
              { run: thisRun, label: "RUN A" },
              { run: compareRun, label: "RUN B" },
            ].map(({ run, label }) => (
              <div
                key={run.id}
                style={{
                  ...S.mono,
                  fontSize: "9px",
                  ...S.dim,
                  letterSpacing: "2px",
                  padding: "8px 12px",
                  background: "rgba(232,228,222,0.02)",
                  borderRadius: "3px",
                }}
              >
                {label} — {new Date(run.createdAt).toLocaleString()}
              </div>
            ))}
          </div>

          <RunComparison runA={thisRun} runB={compareRun} />
        </div>
      ) : (
        <div>
          {/* Arc summary */}
          <ArcCard arcData={thisRun.stageData?.arc} />

          {/* Shot list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
            {(thisRun.shots || []).map((shot, i) => (
              <ShotRow
                key={i}
                shot={shot}
                validation={thisRun.validations?.[i]}
                changed={false}
                missing={false}
              />
            ))}
          </div>

          {/* Raw schema expandable */}
          <details style={{ ...S.card, marginTop: "16px" }}>
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
                maxHeight: "400px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {schema}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
