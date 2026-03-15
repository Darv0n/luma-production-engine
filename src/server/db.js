/**
 * LOWDB INSTANCE
 *
 * Single source of truth for all project data.
 * File: data/projects.json (gitignored, lives on disk)
 *
 * Schema:
 *   { projects: { [id]: Project } }
 *
 * Uses LowDB v7 sync preset — same synchronous interface as localStorage
 * but file-backed and accessible from the server side.
 */

import { JSONFileSyncPreset } from 'lowdb/node';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = JSONFileSyncPreset(DATA_FILE, { projects: {} });

/**
 * Reload from disk and return all projects as a sorted array.
 */
export function getProjects() {
  db.read();
  return Object.values(db.data.projects).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

/**
 * Reload from disk and return a single project or null.
 */
export function getProject(id) {
  db.read();
  return db.data.projects[id] || null;
}

/**
 * Insert or replace a project and flush to disk.
 */
export function saveProject(project) {
  db.read();
  db.data.projects[project.id] = project;
  db.write();
}

/**
 * Delete a project and flush to disk.
 */
export function deleteProject(id) {
  db.read();
  delete db.data.projects[id];
  db.write();
}

/**
 * Append a run to an existing project (never overwrite).
 */
export function addRun(projectId, run) {
  db.read();
  const p = db.data.projects[projectId];
  if (!p) return;
  db.data.projects[projectId] = {
    ...p,
    updatedAt: new Date().toISOString(),
    runs: [...(p.runs || []), run],
  };
  db.write();
}

/**
 * Bulk import projects (used for localStorage migration).
 */
export function importProjects(projectMap) {
  db.read();
  db.data.projects = { ...db.data.projects, ...projectMap };
  db.write();
}
