/**
 * ASSEMBLY CLIENT
 *
 * Client-side fetch wrappers for the FFmpeg assembly pipeline.
 */

/**
 * Start assembly for a project run.
 * @param {string} projectId
 * @param {string} runId
 * @param {Object} options - { audioTrackUrl?, outputName? }
 */
export async function startAssembly(projectId, runId, options = {}) {
  const res = await fetch('/api/assembly/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, runId, ...options }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || `Assembly error ${res.status}`);
  }
  return res.json();
}

/**
 * Poll assembly progress.
 * @param {string} projectId
 * @returns {{ phase, percent, currentStep, error }}
 */
export async function pollAssemblyStatus(projectId) {
  const res = await fetch(`/api/assembly/status/${projectId}`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * Get the download URL for the assembled video.
 * @param {string} projectId
 * @returns {{ url, exists }}
 */
export async function getDownloadUrl(projectId) {
  const res = await fetch(`/api/assembly/download/${projectId}`);
  if (!res.ok) return null;
  return res.json();
}
