import { useState } from "react";
import { S, COLORS } from "../styles/theme.js";

// ─── Inline style helpers ─────────────────────────────────────────────────────
const ROW = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const SIDEBAR_BG = "rgba(255,255,255,0.015)";
const ACTIVE_BG = "rgba(232,228,222,0.05)";

/**
 * ProjectSidebar
 *
 * Props:
 *   projects        — Project[]
 *   activeId        — string | null
 *   onLoad          — (id) => void
 *   onNew           — () => void
 *   onRename        — (id, name) => void
 *   onDelete        — (id) => void
 *   onAddCharacter  — (projectId, { name, description }) => void
 *   onRemoveCharacter — (projectId, charName) => void
 */
export default function ProjectSidebar({
  projects,
  activeId,
  onLoad,
  onNew,
  onRename,
  onDelete,
  onAddCharacter,
  onRemoveCharacter,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [charName, setCharName] = useState("");
  const [charDesc, setCharDesc] = useState("");

  const activeProject = projects.find((p) => p.id === activeId) || null;

  const startRename = (p) => {
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const commitRename = (id) => {
    if (renameValue.trim()) onRename(id, renameValue.trim());
    setRenamingId(null);
  };

  const handleAddChar = () => {
    if (!charName.trim() || !activeId) return;
    onAddCharacter(activeId, { name: charName.trim(), description: charDesc.trim() });
    setCharName("");
    setCharDesc("");
  };

  return (
    <div
      style={{
        width: "220px",
        minHeight: "100vh",
        background: SIDEBAR_BG,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 14px 14px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ ...S.label, fontSize: "8px", letterSpacing: "3px", marginBottom: "10px" }}>
          PROJECTS
        </div>
        <button
          onClick={onNew}
          style={{
            ...S.btnSec,
            width: "100%",
            fontSize: "9px",
            letterSpacing: "1.5px",
            padding: "7px 10px",
            textAlign: "left",
          }}
        >
          + NEW PROJECT
        </button>
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
        {projects.length === 0 && (
          <div
            style={{
              ...S.mono,
              fontSize: "9px",
              color: COLORS.textDim,
              padding: "12px 14px",
              lineHeight: "1.6",
            }}
          >
            No saved projects yet.{"\n"}Run the pipeline to auto-save.
          </div>
        )}
        {projects.map((p) => {
          const isActive = p.id === activeId;
          const isRenaming = renamingId === p.id;
          const isDeleting = deletingId === p.id;
          const runCount = p.runs?.length || 0;

          return (
            <div
              key={p.id}
              style={{
                background: isActive ? ACTIVE_BG : "transparent",
                borderLeft: isActive
                  ? "2px solid rgba(232,228,222,0.2)"
                  : "2px solid transparent",
                padding: "8px 12px 8px 10px",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onClick={() => !isRenaming && !isDeleting && onLoad(p.id)}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(p.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    ...S.input,
                    fontSize: "10px",
                    padding: "3px 6px",
                    width: "100%",
                  }}
                />
              ) : (
                <div
                  style={{
                    ...S.mono,
                    fontSize: "10px",
                    color: isActive ? COLORS.textBright : COLORS.textMid,
                    lineHeight: "1.4",
                    wordBreak: "break-word",
                  }}
                >
                  {p.name}
                </div>
              )}

              <div
                style={{
                  ...ROW,
                  marginTop: "4px",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ ...S.mono, fontSize: "8px", color: COLORS.textDim }}>
                  {runCount} run{runCount !== 1 ? "s" : ""} ·{" "}
                  {new Date(p.updatedAt).toLocaleDateString()}
                </span>

                {isDeleting ? (
                  <div style={ROW} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => { onDelete(p.id); setDeletingId(null); }}
                      style={{ ...S.btnSec, fontSize: "8px", padding: "2px 6px", color: "#c0564a", borderColor: "rgba(192,86,74,0.3)" }}
                    >
                      confirm
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      style={{ ...S.btnSec, fontSize: "8px", padding: "2px 6px" }}
                    >
                      cancel
                    </button>
                  </div>
                ) : (
                  <div style={ROW} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => startRename(p)}
                      style={{ ...S.btnSec, fontSize: "8px", padding: "2px 6px", border: "none", background: "transparent", opacity: 0.5 }}
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => setDeletingId(p.id)}
                      style={{ ...S.btnSec, fontSize: "8px", padding: "2px 6px", border: "none", background: "transparent", opacity: 0.5 }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Characters section — only shown when a project is active */}
      {activeProject && (
        <div
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            padding: "12px 14px",
          }}
        >
          <div style={{ ...S.label, fontSize: "8px", letterSpacing: "2px", marginBottom: "8px" }}>
            CHARACTERS
          </div>

          {/* Registered characters */}
          {(activeProject.characters || []).length === 0 ? (
            <div style={{ ...S.mono, fontSize: "9px", color: COLORS.textDim, marginBottom: "8px" }}>
              None registered
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
              {(activeProject.characters || []).map((c) => (
                <div
                  key={c.name}
                  style={{
                    ...ROW,
                    justifyContent: "space-between",
                    padding: "4px 8px",
                    background: "rgba(232,228,222,0.03)",
                    borderRadius: "2px",
                  }}
                >
                  <div>
                    <div style={{ ...S.mono, fontSize: "9px", color: COLORS.textMid }}>
                      @{c.name}
                    </div>
                    {c.description && (
                      <div style={{ ...S.mono, fontSize: "8px", color: COLORS.textDim }}>
                        {c.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveCharacter(activeProject.id, c.name)}
                    style={{ ...S.btnSec, fontSize: "8px", padding: "1px 5px", border: "none", background: "transparent", opacity: 0.4 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add character form */}
          <input
            value={charName}
            onChange={(e) => setCharName(e.target.value)}
            placeholder="name"
            style={{ ...S.input, fontSize: "9px", padding: "5px 8px", marginBottom: "4px" }}
            onKeyDown={(e) => e.key === "Enter" && handleAddChar()}
          />
          <input
            value={charDesc}
            onChange={(e) => setCharDesc(e.target.value)}
            placeholder="description (optional)"
            style={{ ...S.input, fontSize: "9px", padding: "5px 8px", marginBottom: "6px" }}
            onKeyDown={(e) => e.key === "Enter" && handleAddChar()}
          />
          <button
            onClick={handleAddChar}
            disabled={!charName.trim()}
            style={{ ...S.btnSec, width: "100%", fontSize: "8px", letterSpacing: "1px", padding: "5px" }}
          >
            + ADD CHARACTER
          </button>
        </div>
      )}
    </div>
  );
}
