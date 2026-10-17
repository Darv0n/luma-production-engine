/**
 * WAR ROOM CLIENT
 *
 * Fetch wrappers for the War Room API.
 * All state flows through SSE — these are fire-and-forget commands.
 */

const BASE = '/api/war-room';

function post(url, body = {}) {
  return fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

export function startWarRoom(projectId) {
  return post('/start', { projectId });
}

export function sendMessage(projectId, text) {
  return post('/message', { projectId, text });
}

export function connectPlatform(projectId, boardId) {
  return post('/connect', { projectId, boardId });
}

export function generateKeyframe(projectId, prompt, options = {}) {
  return post('/keyframe', { projectId, prompt, ...options });
}

export function pushToPlatform(projectId, assetId) {
  return post('/push', { projectId, assetId });
}

export function platformPrompt(projectId, message, attachImages) {
  return post('/platform-prompt', { projectId, message, attachImages });
}

export function takeScreenshot(projectId) {
  return post('/screenshot', { projectId });
}

export function pauseWarRoom(projectId) {
  return post('/pause', { projectId });
}

export function resumeWarRoom(projectId) {
  return post('/resume', { projectId });
}

export function abortWarRoom(projectId) {
  return post('/abort', { projectId });
}

export function traverseWithGemini(projectId, goal) {
  return post('/traverse', { projectId, goal });
}

export function runProduction(projectId, shots) {
  return post('/run-production', { projectId, shots });
}

export function startCoPilot(projectId, boardId) {
  return post('/copilot-start', { projectId, boardId });
}

export function stopCoPilot(projectId) {
  return post('/copilot-stop', { projectId });
}

export function promptAssist(projectId, roughDirection) {
  return post('/prompt-assist', { projectId, roughDirection });
}
