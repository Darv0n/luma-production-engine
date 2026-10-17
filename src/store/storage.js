/**
 * STORAGE CLIENT
 *
 * Source of truth: data/projects.json on disk (via LowDB server)
 * Accessed through the /api/storage/* REST endpoints.
 *
 * On first load: auto-migrates existing localStorage data to the server
 * so nothing is lost when switching to the new storage layer.
 *
 * All methods are async — await them at call sites.
 */

const BASE = '/api/storage';

async function req(method, path, body) {
  const opts = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Storage ${method} ${path} failed: ${res.status}`);
  }
  return res.json();
}

export const storage = {
  /** Return all projects sorted newest-first. */
  async getProjects() {
    return req('GET', '/projects');
  },

  /** Return a single project or null. */
  async getProject(id) {
    try {
      return await req('GET', `/projects/${id}`);
    } catch {
      return null;
    }
  },

  /** Insert or replace a project. */
  async saveProject(project) {
    return req('POST', '/projects', project);
  },

  /** Delete a project by id. */
  async deleteProject(id) {
    return req('DELETE', `/projects/${id}`);
  },

  /** Append a run to an existing project (never overwrites). */
  async addRun(projectId, run) {
    return req('POST', `/runs/${projectId}`, run);
  },

  /** Update dialogue state for a specific project run. */
  async updateDialogues(projectId, runId, dialogues) {
    return req('PATCH', `/dialogues/${projectId}/${runId}`, dialogues);
  },
};

/**
 * Migrate localStorage data to the server on first load.
 * Runs once on app startup — safe to call multiple times (idempotent).
 */
export async function migrateFromLocalStorage() {
  const LEGACY_KEY = 'luma_projects';
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return 0;

  let legacyMap;
  try { legacyMap = JSON.parse(raw); }
  catch { return 0; }

  if (!legacyMap || typeof legacyMap !== 'object') return 0;

  // Check if server already has data — don't overwrite
  const existing = await storage.getProjects();
  if (existing.length > 0) {
    // Server already has projects — clear localStorage and return
    localStorage.removeItem(LEGACY_KEY);
    return 0;
  }

  // Migrate
  const count = Object.keys(legacyMap).length;
  if (count === 0) return 0;

  await req('POST', '/import', legacyMap);
  localStorage.removeItem(LEGACY_KEY);
  console.log(`[storage] Migrated ${count} project(s) from localStorage → disk`);
  return count;
}
