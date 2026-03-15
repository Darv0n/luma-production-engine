/**
 * PROJECT DATA MODEL
 *
 * Defines the shape of Project and Run objects.
 * Designed from day 1 for Phase 2/3 extension:
 *   - runs[] never overwrites — appends (P12: run history)
 *   - stageData preserved per run (P12: shot-level re-run with locked context)
 *   - inputs stored per project (not per run) — project identity is the concept
 *
 * Storage is abstracted in storage.js. This file is shapes only.
 */

/**
 * Generate a simple unique ID (no external dependency).
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Create a new Project object.
 *
 * @param {Object} inputs — { concept, format, product, targetDuration }
 * @param {string} [name] — user-provided name, defaults to "Untitled – {date}"
 * @returns {Project}
 */
export function createProject(inputs, name) {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: name || `Untitled — ${new Date().toLocaleDateString()}`,
    createdAt: now,
    updatedAt: now,
    inputs: {
      concept: inputs.concept || "",
      format: inputs.format || "30s",
      product: inputs.product || "",
      targetDuration: inputs.targetDuration || "30 seconds",
    },
    runs: [],
  };
}

/**
 * Create a new Run object.
 *
 * @param {Object} stageData — { scan, arc } (intermediate stages, locked for re-run)
 * @param {Array} shots — final shot list
 * @param {Array} validations — per-shot validation results
 * @param {string} schema — plain text output
 * @returns {Run}
 */
export function createRun(stageData, shots, validations, schema) {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    stageData: {
      scan: stageData.scan || null,
      arc: stageData.arc || null,
    },
    shots: shots || [],
    validations: validations || [],
    schema: schema || "",
  };
}

/**
 * Append a run to a project (never overwrites — always appends).
 * Returns a new project object (immutable update).
 *
 * @param {Project} project
 * @param {Run} run
 * @returns {Project}
 */
export function appendRun(project, run) {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    runs: [...project.runs, run],
  };
}

/**
 * Get the latest run from a project, or null if no runs.
 *
 * @param {Project} project
 * @returns {Run|null}
 */
export function latestRun(project) {
  if (!project.runs.length) return null;
  return project.runs[project.runs.length - 1];
}
