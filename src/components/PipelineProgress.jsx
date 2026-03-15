import { S } from "../styles/theme.js";

const PIPELINE_STAGES = [
  { id: "scan", label: "SCAN", icon: "◎", desc: "Mapping terrain — audience, stakes, leverage" },
  { id: "arc", label: "ARC", icon: "◠", desc: "Architecting emotional trajectory" },
  { id: "shots", label: "SHOTS", icon: "▦", desc: "Generating shot list with Luma-validated prompts" },
  { id: "validate", label: "VALIDATE", icon: "⬡", desc: "Pressure-testing every prompt against Luma rules" },
  { id: "done", label: "⧑ SCHEMA", icon: "⧑", desc: "Production schema ready" },
];

export default function PipelineProgress({ currentStage, stageData }) {
  const currentIdx = PIPELINE_STAGES.findIndex((s) => s.id === currentStage);

  return (
    <div style={{ margin: "24px 0 32px" }}>
      <div style={{ display: "flex", gap: "2px" }}>
        {PIPELINE_STAGES.map((s, i) => {
          const isActive = s.id === currentStage;
          const isDone = i < currentIdx || currentStage === "done";
          const isProcessing = isActive && !stageData[s.id];
          return (
            <div
              key={s.id}
              style={{
                flex: 1,
                padding: "12px 8px",
                textAlign: "center",
                background: isActive ? "rgba(232,228,222,0.04)" : "transparent",
                borderBottom: isDone
                  ? "2px solid rgba(232,228,222,0.3)"
                  : isActive
                  ? "2px solid rgba(232,228,222,0.15)"
                  : "2px solid rgba(232,228,222,0.03)",
                transition: "all 0.4s ease",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  marginBottom: "4px",
                  color: isDone
                    ? "rgba(232,228,222,0.6)"
                    : isActive
                    ? "#e8e4de"
                    : "rgba(232,228,222,0.15)",
                  animation: isProcessing ? "pulse 1.5s infinite" : "none",
                }}
              >
                {isDone ? "✓" : s.icon}
              </div>
              <div
                style={{
                  ...S.mono,
                  fontSize: "8px",
                  letterSpacing: "2px",
                  color: isDone
                    ? "rgba(232,228,222,0.4)"
                    : isActive
                    ? "rgba(232,228,222,0.7)"
                    : "rgba(232,228,222,0.12)",
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
      {currentStage !== "idle" && currentStage !== "done" && (
        <div
          style={{
            ...S.mono,
            fontSize: "10px",
            color: "rgba(232,228,222,0.3)",
            textAlign: "center",
            marginTop: "12px",
            letterSpacing: "1px",
            animation: "pulse 1.5s infinite",
          }}
        >
          {PIPELINE_STAGES.find((s) => s.id === currentStage)?.desc || ""}
        </div>
      )}
    </div>
  );
}
