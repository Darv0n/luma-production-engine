/**
 * ABSTRACT STORAGE INTERFACE
 *
 * Current implementation: localStorage.
 * Swap the internals (not the interface) for server persistence in Phase 3.
 *
 * All methods are synchronous (localStorage constraint).
 * Phase 3 will make them async — callers should await now even though they don't need to,
 * so the migration is a one-line change per call site.
 *
 * Error handling: QuotaExceededError surfaces as a thrown Error with message
 * "Storage quota exceeded. Delete old projects to continue."
 */

const STORAGE_KEY = "luma_projects";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      throw new Error(
        "Storage quota exceeded. Delete old projects to continue."
      );
    }
    throw e;
  }
}

export const storage = {
  /**
   * Return all projects as an array, sorted newest-first.
   * @returns {Project[]}
   */
  getProjects() {
    const map = load();
    return Object.values(map).sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  },

  /**
   * Return a single project by id, or null.
   * @param {string} id
   * @returns {Project|null}
   */
  getProject(id) {
    const map = load();
    return map[id] || null;
  },

  /**
   * Insert or replace a project.
   * @param {Project} project
   */
  saveProject(project) {
    const map = load();
    map[project.id] = project;
    save(map);
  },

  /**
   * Delete a project by id. No-op if not found.
   * @param {string} id
   */
  deleteProject(id) {
    const map = load();
    delete map[id];
    save(map);
  },

  /**
   * Append a run to an existing project (P12: never overwrite).
   * No-op if project not found.
   * @param {string} projectId
   * @param {Run} run
   */
  addRun(projectId, run) {
    const map = load();
    if (!map[projectId]) return;
    map[projectId] = {
      ...map[projectId],
      updatedAt: new Date().toISOString(),
      runs: [...(map[projectId].runs || []), run],
    };
    save(map);
  },
};
