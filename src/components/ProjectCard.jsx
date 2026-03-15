import { S, COLORS } from "../styles/theme.js";
import { estimateCredits } from "../lib/credits.js";
import { latestRun } from "../store/project-model.js";

export default function ProjectCard({ project, onClick }) {
  const latest = latestRun(project);
  const runCount = project.runs?.length || 0;
  const credits = latest ? estimateCredits(latest.shots || []) : 0;
  const arc = latest?.stageData?.arc;
  const scan = latest?.stageData?.scan;

  return (
    <div
      onClick={onClick}
      style={{
        ...S.card,
        cursor: "pointer",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        transition: "border-color 0.15s, background 0.15s",
        borderColor: "rgba(232,228,222,0.08)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(232,228,222,0.2)";
        e.currentTarget.style.background = "rgba(232,228,222,0.03)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(232,228,222,0.06)";
        e.currentTarget.style.background = COLORS.surface;
      }}
    >
      {/* Project name */}
      <div style={{ ...S.mono, fontSize: "13px", color: COLORS.textBright, lineHeight: "1.3" }}>
        {project.name}
      </div>

      {/* Handle (if available) */}
      {scan?.handle && (
        <div
          style={{
            ...S.mono,
            fontSize: "10px",
            color: COLORS.textMid,
            fontStyle: "italic",
            lineHeight: "1.4",
          }}
        >
          "{scan.handle}"
        </div>
      )}

      {/* Arc + shots row */}
      {arc && (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ ...S.label, fontSize: "7px", marginBottom: "2px" }}>ARC</div>
            <div style={{ ...S.mono, fontSize: "9px", color: COLORS.textMid }}>
              {arc.shape || "—"}
            </div>
          </div>
          <div>
            <div style={{ ...S.label, fontSize: "7px", marginBottom: "2px" }}>SHOTS</div>
            <div style={{ ...S.mono, fontSize: "9px", color: COLORS.textMid }}>
              {latest?.shots?.length || 0}
            </div>
          </div>
          {credits > 0 && (
            <div>
              <div style={{ ...S.label, fontSize: "7px", marginBottom: "2px" }}>CREDITS</div>
              <div style={{ ...S.mono, fontSize: "9px", color: COLORS.textMid }}>
                ~{credits.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "2px",
        }}
      >
        <div style={{ ...S.mono, fontSize: "8px", color: COLORS.textDim }}>
          {runCount} run{runCount !== 1 ? "s" : ""} · {new Date(project.updatedAt).toLocaleDateString()}
        </div>
        <div
          style={{
            ...S.mono,
            fontSize: "8px",
            letterSpacing: "1.5px",
            color: COLORS.textDim,
          }}
        >
          OPEN →
        </div>
      </div>
    </div>
  );
}
