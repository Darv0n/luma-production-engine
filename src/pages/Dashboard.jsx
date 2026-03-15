import { useOutletContext, useNavigate } from "react-router-dom";
import { S, COLORS } from "../styles/theme.js";
import ProjectCard from "../components/ProjectCard.jsx";

export default function Dashboard() {
  const { projects } = useOutletContext();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "36px" }}>
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
          <button
            onClick={() => navigate("/projects/new")}
            style={{
              ...S.btnPrimary,
              width: "auto",
              fontSize: "10px",
              letterSpacing: "2px",
              padding: "10px 20px",
            }}
          >
            + NEW PROJECT
          </button>
        </div>
        <div style={{ fontSize: "9px", ...S.dim, letterSpacing: "1.5px", marginTop: "8px" }}>
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Empty state */}
      {projects.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "80px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div style={{ fontSize: "28px", opacity: 0.2 }}>⧑</div>
          <div style={{ ...S.mono, fontSize: "12px", ...S.dim, letterSpacing: "2px" }}>
            NO PROJECTS YET
          </div>
          <div style={{ ...S.mono, fontSize: "10px", color: COLORS.textDim, maxWidth: "300px", lineHeight: "1.6" }}>
            Drop a concept, run the pipeline, and your production schema will be saved automatically.
          </div>
          <button
            onClick={() => navigate("/projects/new")}
            style={{ ...S.btnPrimary, width: "auto", fontSize: "11px", padding: "12px 24px", letterSpacing: "2px" }}
          >
            START FIRST PROJECT
          </button>
        </div>
      )}

      {/* Project grid */}
      {projects.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "12px",
          }}
        >
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => navigate(`/projects/${p.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
