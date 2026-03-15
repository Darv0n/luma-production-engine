import { useState, useEffect, useCallback } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { S, GLOBAL_CSS } from "./src/styles/theme.js";
import { storage, migrateFromLocalStorage } from "./src/store/storage.js";
import ProjectSidebar from "./src/components/ProjectSidebar.jsx";
import Dashboard from "./src/pages/Dashboard.jsx";
import ProjectWorkspace from "./src/pages/ProjectWorkspace.jsx";
import RunView from "./src/pages/RunView.jsx";

// ─── Layout (sidebar + outlet) ────────────────────────────────────────────────
function Layout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [projects, setProjects] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const refresh = useCallback(async () => {
    const list = await storage.getProjects();
    setProjects(list);
  }, []);

  // Load projects on mount + inject global CSS + migrate localStorage
  useEffect(() => {
    const init = async () => {
      await migrateFromLocalStorage();
      await refresh();
    };
    init();
    const style = document.createElement("style");
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive active project id from URL (excludes "new")
  const idMatch = pathname.match(/^\/projects\/([^/]+)/);
  const currentId = idMatch?.[1];
  const activeId = currentId && currentId !== "new" ? currentId : null;

  // ─── Sidebar callbacks ──────────────────────────────────────────────────────
  const handleLoad = (id) => navigate(`/projects/${id}`);
  const handleNew = () => navigate("/projects/new");

  const handleRename = async (id, name) => {
    const p = await storage.getProject(id);
    if (!p) return;
    await storage.saveProject({ ...p, name, updatedAt: new Date().toISOString() });
    refresh();
  };

  const handleDelete = async (id) => {
    await storage.deleteProject(id);
    if (activeId === id) navigate("/projects");
    refresh();
  };

  const handleAddChar = async (projectId, char) => {
    const p = await storage.getProject(projectId);
    if (!p) return;
    if ((p.characters || []).some((c) => c.name === char.name)) return;
    await storage.saveProject({
      ...p,
      characters: [...(p.characters || []), char],
      updatedAt: new Date().toISOString(),
    });
    refresh();
  };

  const handleRemoveChar = async (projectId, charName) => {
    const p = await storage.getProject(projectId);
    if (!p) return;
    await storage.saveProject({
      ...p,
      characters: (p.characters || []).filter((c) => c.name !== charName),
      updatedAt: new Date().toISOString(),
    });
    refresh();
  };

  const handleUpdateChar = async (projectId, charName, patch) => {
    const p = await storage.getProject(projectId);
    if (!p) return;
    await storage.saveProject({
      ...p,
      characters: (p.characters || []).map((c) =>
        c.name === charName ? { ...c, ...patch } : c
      ),
      updatedAt: new Date().toISOString(),
    });
    refresh();
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#0c0c0c",
        color: "#e8e4de",
        ...S.mono,
      }}
    >
      {/* Sidebar toggle */}
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
          activeId={activeId}
          onLoad={handleLoad}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
          onAddCharacter={handleAddChar}
          onRemoveCharacter={handleRemoveChar}
          onUpdateCharacter={handleUpdateChar}
        />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Outlet context={{ projects, refresh }} />
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/projects" replace />} />
          <Route path="projects" element={<Dashboard />} />
          <Route path="projects/new" element={<ProjectWorkspace />} />
          <Route path="projects/:id" element={<ProjectWorkspace />} />
          <Route path="projects/:id/runs" element={<RunView />} />
          <Route path="projects/:id/runs/:runId" element={<RunView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
