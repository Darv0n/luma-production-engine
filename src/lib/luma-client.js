/**
 * LUMA CLIENT
 *
 * Client-side functions for submitting shots to the Luma Dream Machine API
 * via the server-side proxy (key never leaves the server).
 *
 * Model mapping:
 *   Ray3.14 → ray-flash-2  (fast, cheap, no character ref)
 *   Ray3    → ray-2        (slower, supports character ref concepts)
 *
 * Draft mode always uses 540p resolution for fast, cheap iteration.
 * Duration mapping: "10s" → "9s" (API max)
 */

const MODEL_MAP = {
  'Ray3.14': 'ray-flash-2',
  'Ray3': 'ray-2',
};

const DURATION_MAP = {
  '10s': '9s',
  '5s': '5s',
  '9s': '9s',
};

/**
 * Map a shot object to Luma API VideoCreateParams.
 * Always submits at 540p for draft iteration.
 *
 * @param {Object} shot
 * @param {string|null} keyframeImageUrl — if set, use as frame0 (I2V instead of T2V)
 */
export function toApiParams(shot, keyframeImageUrl = null) {
  const model = MODEL_MAP[shot.model] || 'ray-flash-2';
  const duration = DURATION_MAP[shot.duration] || '5s';
  const aspect_ratio = shot.aspect || '16:9';

  const params = {
    model,
    prompt: shot.prompt,
    aspect_ratio,
    resolution: '540p',
    duration,
    loop: shot.loop || false,
  };

  // If a keyframe image exists, use I2V — the model animates from visual truth
  if (keyframeImageUrl) {
    params.keyframes = {
      frame0: { type: 'image', url: keyframeImageUrl },
    };
  }

  if (shot.dynamicRange === 'hdr') params.dynamic_range = 'hdr';
  if (shot.cameraControl) params.camera_control = { type: shot.cameraControl };

  return params;
}

/**
 * Submit a single shot for draft generation.
 * @param {Object} shot
 * @param {string|null} keyframeImageUrl — if provided, I2V from keyframe instead of T2V
 */
export async function submitDraft(shot, keyframeImageUrl = null) {
  const params = toApiParams(shot, keyframeImageUrl);

  const res = await fetch('/api/luma/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `Luma API error ${res.status}`);
  }

  return res.json();
}

/**
 * Poll a generation by ID.
 * Returns the generation object with state + assets.
 */
export async function pollGeneration(id) {
  const res = await fetch(`/api/luma/status/${id}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `Luma status error ${res.status}`);
  }

  return res.json();
}

/**
 * Submit a final render using the approved draft generation ID as I2V keyframe.
 * Submits at 1080p. The draft generation locks the composition — the final
 * render inherits it and upgrades quality.
 *
 * API keyframe reference: { type: "generation", id: draftId }
 * This tells Luma to use the completed draft video as the start frame.
 *
 * @param {Object} shot — shot object
 * @param {string} draftId — generation ID from the approved 540p draft
 */
export async function submitFinalRender(shot, draftId) {
  const model = MODEL_MAP[shot.model] || 'ray-flash-2';
  const duration = DURATION_MAP[shot.duration] || '5s';

  const params = {
    model,
    prompt: shot.prompt,
    aspect_ratio: shot.aspect || '16:9',
    resolution: '1080p',
    duration,
    loop: shot.loop || false,
    keyframes: {
      frame0: {
        type: 'generation',
        id: draftId,
      },
    },
  };

  if (shot.dynamicRange === 'hdr') params.dynamic_range = 'hdr';
  if (shot.cameraControl) params.camera_control = { type: shot.cameraControl };

  const res = await fetch('/api/luma/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `Luma API error ${res.status}`);
  }

  return res.json();
}

/**
 * Returns true if this shot requires character reference (API can't fulfill it fully).
 * We still generate T2V as a draft, but flag it so the user knows face
 * consistency won't be preserved.
 */
export function needsCharacterRef(shot) {
  return shot.characterRef && shot.characterRef !== 'none';
}

// ─── Photon image generation (keyframe design) ────────────────────────────────

/**
 * Generate a Photon image synchronously.
 * Used for keyframe design — create the object/character before animating it.
 *
 * @param {string} prompt — describe the object or character precisely
 * @param {string} aspectRatio — default '9:16' for social vertical
 * @param {string} model — 'photon-1' | 'photon-flash-1'
 */
export async function generateKeyframeImage(prompt, aspectRatio = '9:16', model = 'photon-1') {
  const res = await fetch('/api/luma/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      aspect_ratio: aspectRatio,
      sync: true,
      sync_timeout: 60,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `Photon error ${res.status}`);
  }

  const gen = await res.json();
  // Photon sync returns completed with assets.image
  return {
    id: gen.id,
    imageUrl: gen.assets?.image || null,
    state: gen.state,
  };
}

// ─── Post-chain operations ────────────────────────────────────────────────────

/**
 * Add audio to a completed generation.
 * @param {string} generationId
 * @param {string} prompt — audio description (from shot.audioPrompt)
 * @param {string} negativePrompt — sounds to avoid
 */
export async function submitAudio(generationId, prompt = '', negativePrompt = '') {
  const res = await fetch(`/api/luma/audio/${generationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: negativePrompt,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `Audio error ${res.status}`);
  }
  return res.json();
}

/**
 * Upscale a completed generation to a target resolution.
 * @param {string} generationId
 * @param {string} resolution — '720p' | '1080p' | '4k'
 */
export async function submitUpscale(generationId, resolution = '1080p') {
  const res = await fetch(`/api/luma/upscale/${generationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `Upscale error ${res.status}`);
  }
  return res.json();
}

// ─── Platform session ─────────────────────────────────────────────────────────

export async function checkPlatformSession() {
  const res = await fetch('/api/platform/session');
  return res.json();
}

export async function openPlatformLogin() {
  const res = await fetch('/api/platform/login', { method: 'POST' });
  return res.json();
}

/**
 * Submit a char ref video generation via Playwright platform automation.
 * @param {Object} shot — shot object
 * @param {string} imageBase64 — base64-encoded char ref image
 * @param {string} imageExt — file extension ('jpg', 'png', etc.)
 */
export async function submitCharRef(shot, imageBase64, imageExt = 'jpg') {
  const res = await fetch('/api/platform/char-ref', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shot, imageBase64, imageExt }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || `Platform error ${res.status}`);
  }

  return res.json();
}
