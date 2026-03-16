/**
 * LUMA PLATFORM AUTOMATION
 *
 * Server-side Playwright automation for the Dream Machine platform.
 * Provides full platform operation: boards, generation, modify, extend,
 * brainstorm, screenshot, download, and character reference workflows.
 *
 * Session is persisted to .playwright-session/ so the user only
 * needs to log in once.
 *
 * Shared helpers (launchContext, dismissDialogs, setGenerationSettings,
 * submitOnPage, interceptGenerationId) are extracted to reduce duplication
 * across platform operations.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import http from 'http';

const SESSION_DIR = path.resolve(process.cwd(), '.playwright-session');
const DREAM_MACHINE = 'https://dream-machine.lumalabs.ai';
const PHOTON_API = 'https://api.lumalabs.ai/api/photon/v2';

// ─── Model mapping ────────────────────────────────────────────────────────────
const ASPECT_LABELS = {
  '16:9': '16:9', '9:16': '9:16', '1:1': '1:1',
  '4:3': '4:3', '3:4': '3:4', '21:9': '21:9',
};

const DURATION_LABELS = {
  '5s': '5s', '9s': '9s', '10s': '9s',
};

// ─── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Launch a persistent browser context. All platform functions share this.
 * @param {Object} options - { headless, viewport }
 */
async function launchContext(options = {}) {
  return chromium.launchPersistentContext(SESSION_DIR, {
    headless: options.headless !== false,
    args: ['--no-sandbox'],
    viewport: options.viewport || undefined,
  });
}

/**
 * Dismiss announcement/promo dialogs that appear on platform navigation.
 */
async function dismissDialogs(page) {
  try {
    const btn = page.locator('dialog button').first();
    if (await btn.isVisible({ timeout: 2000 })) await btn.click();
  } catch { /* no dialog */ }
}

/**
 * Set generation settings on the platform (model, aspect, duration, draft toggle).
 * @param {Object} page - Playwright page
 * @param {Object} settings - { model, aspect, duration, draft }
 */
async function setGenerationSettings(page, settings = {}) {
  const modelBtn = page.locator('button').filter({ hasText: /video.*Ray/i }).first();
  if (await modelBtn.isVisible({ timeout: 3000 })) {
    await modelBtn.click();
    await page.waitForTimeout(500);

    // Model selection (reasoning, etc.)
    if (settings.model) {
      const modelOption = page.locator('button, [role="option"]').filter({ hasText: new RegExp(settings.model, 'i') }).first();
      if (await modelOption.isVisible({ timeout: 2000 })) {
        await modelOption.click();
      }
    }

    // Draft toggle
    if (settings.draft !== undefined) {
      const draftToggle = page.locator('button').filter({ hasText: /draft/i }).first();
      if (await draftToggle.isVisible({ timeout: 2000 })) {
        const isDraft = await draftToggle.evaluate((el) =>
          el.classList.contains('active') ||
          el.getAttribute('aria-pressed') === 'true' ||
          el.getAttribute('data-state') === 'on'
        );
        if (isDraft !== settings.draft) await draftToggle.click();
      }
    }

    // Aspect ratio
    if (settings.aspect) {
      const aspectLabel = ASPECT_LABELS[settings.aspect] || '16:9';
      const aspectBtn = page.locator('button').filter({ hasText: aspectLabel }).first();
      if (await aspectBtn.isVisible({ timeout: 2000 })) await aspectBtn.click();
    }

    // Duration
    if (settings.duration) {
      const durLabel = DURATION_LABELS[settings.duration] || '5s';
      const durBtn = page.locator('button').filter({ hasText: durLabel }).first();
      if (await durBtn.isVisible({ timeout: 2000 })) await durBtn.click();
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

/**
 * Fill prompt and submit generation on the current page.
 * Returns the captured generation ID via network interception.
 * @param {Object} page - Playwright page
 * @param {string} prompt - Generation prompt
 * @param {Object} options - { timeout }
 */
async function submitOnPage(page, prompt, options = {}) {
  let generationId = null;
  const timeout = options.timeout || 15000;

  // Set up network interception
  const interceptor = interceptGenerationId(page, (id) => { generationId = id; });

  // Fill prompt
  const textarea = page.locator('textarea, [contenteditable="true"]').first();
  await textarea.click();
  await textarea.fill(prompt);
  await page.waitForTimeout(300);

  // Submit — try multiple selectors
  const submitBtn = page.locator('button[type="submit"], form button').last();
  const fallbackSubmit = page.locator('button').filter({ hasText: /generate|create/i }).last();

  if (await submitBtn.isEnabled({ timeout: 3000 })) {
    await submitBtn.click();
  } else if (await fallbackSubmit.isVisible({ timeout: 1000 })) {
    await fallbackSubmit.click();
  } else {
    await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="composer"]') ||
                      document.querySelector('[class*="input"]');
      if (!toolbar) return;
      const btns = [...toolbar.querySelectorAll('button:not([disabled])')];
      if (btns.length) btns[btns.length - 1].click();
    });
  }

  // Wait for generation ID capture
  const deadline = Date.now() + timeout;
  while (!generationId && Date.now() < deadline) {
    await page.waitForTimeout(500);
  }

  return generationId;
}

/**
 * Set up network interception to capture generation IDs from POST responses.
 * @param {Object} page - Playwright page
 * @param {Function} onCapture - callback(id)
 */
function interceptGenerationId(page, onCapture) {
  let captured = false;
  page.on('response', async (response) => {
    if (
      response.url().includes('/generations') &&
      response.request().method() === 'POST' &&
      !captured
    ) {
      try {
        const body = await response.json();
        if (body?.id) {
          captured = true;
          onCapture(body.id);
        }
      } catch { /* not a generation response */ }
    }
  });
}

/**
 * Download a file from a URL to a local path.
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<void>}
 */
export function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, destPath).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Download failed: ${response.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (e) => { fs.unlinkSync(destPath); reject(e); });
    }).on('error', reject);
  });
}

// ─── Session check ─────────────────────────────────────────────────────────────
export async function checkSession() {
  try {
    const context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await context.newPage();
    await page.goto(`${DREAM_MACHINE}/board/new`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const url = page.url();
    await context.close();
    const loggedIn = url.includes('dream-machine') && !url.includes('auth') && !url.includes('sign-in');
    return { loggedIn };
  } catch (e) {
    return { loggedIn: false, error: e.message };
  }
}

// ─── Login (opens visible browser for user) ──────────────────────────────────
export async function openLoginBrowser() {
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    args: ['--no-sandbox'],
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(`${DREAM_MACHINE}/board/new`);

  // Wait up to 5 minutes for the user to log in and land on the board page
  try {
    await page.waitForURL('**/board/**', { timeout: 300000 });
    await context.close();
    return { success: true };
  } catch {
    await context.close();
    return { success: false, error: 'Login timeout — please try again' };
  }
}

// ─── Submit char ref video generation ─────────────────────────────────────────
// ─── Get last frame URL from a completed generation ───────────────────────────
/**
 * Fetches the last_frame image URL from the photon/v2 internal API.
 * Used for Continuous Arc — each shot's final frame feeds the next shot's frame0.
 * Requires an active Playwright session with valid auth cookies.
 */
export async function getLastFrame(generationId) {
  try {
    const context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true, args: ['--no-sandbox'],
    });
    const page = await context.newPage();
    const result = await page.evaluate(async (id) => {
      const r = await fetch(
        `https://api.lumalabs.ai/api/photon/v2/generations/${id}`,
        { credentials: 'include' }
      );
      if (!r.ok) return null;
      const data = await r.json();
      return data.artifact?.last_frame?.url || null;
    }, generationId);
    await context.close();
    return result;
  } catch (e) {
    return null;
  }
}

// ─── Submit generation with reasoning model (platform-only) ───────────────────
/**
 * Submits a generation through the Boards interface using ray-v3-reasoning.
 * Platform-only model — significantly better for complex scenes (pivot shots).
 * Intercepts the generation API response to capture the generation ID.
 */
export async function submitWithReasoning(shot, keyframeImageUrl = null) {
  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();

    await page.goto(`${DREAM_MACHINE}/board/new`, { waitUntil: 'networkidle', timeout: 30000 });
    await dismissDialogs(page);

    // Switch to Keyframe tab if we have a keyframe
    if (keyframeImageUrl) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const kf = btns.find(b => b.textContent.trim() === 'Keyframe');
        if (kf) kf.click();
      });
      await page.waitForTimeout(500);
    }

    // Set reasoning model
    await setGenerationSettings(page, { model: 'reasoning' });

    // Submit with prompt
    const generationId = await submitOnPage(page, shot.prompt);
    if (!generationId) throw new Error('Reasoning submission: could not capture generation ID');
    return { id: generationId, state: 'queued', model: 'ray-v3-reasoning' };

  } finally {
    if (context) await context.close();
  }
}

// ─── Brainstorm via platform ───────────────────────────────────────────────────
/**
 * Calls the Luma platform's Brainstorm feature on a completed generation.
 * Returns thematic variation suggestions captured from the platform response.
 * Goes through WebSocket — intercepts the brainstorm data.
 */
export async function callPlatformBrainstorm(generationId, boardId) {
  const results = [];
  let context;

  try {
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true, args: ['--no-sandbox'],
    });
    const page = await context.newPage();

    // Navigate to the board/idea
    const url = boardId
      ? `${DREAM_MACHINE}/board/${boardId}/idea/${generationId}`
      : `${DREAM_MACHINE}/idea/${generationId}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

    // Intercept WebSocket messages for brainstorm data
    page.on('websocket', ws => {
      ws.on('framesent', data => {
        if (String(data.payload || '').includes('brainstorm')) {
          // Outbound brainstorm request
        }
      });
      ws.on('framereceived', data => {
        try {
          const msg = JSON.parse(String(data.payload || ''));
          if (msg?.type === 'brainstorm' || msg?.categories || msg?.brainstorm_results) {
            results.push(msg);
          }
        } catch { /* not JSON */ }
      });
    });

    // Click Brainstorm button
    const brainstormBtn = page.locator('button').filter({ hasText: /brainstorm/i }).first();
    if (await brainstormBtn.isVisible({ timeout: 5000 })) {
      await brainstormBtn.click();
      await page.waitForTimeout(4000); // wait for WS response
    }

    // Extract brainstorm UI results from DOM if WebSocket didn't capture
    const domResults = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return [];
      const categories = [...dialog.querySelectorAll('[class*="category"], h3, h4, strong')];
      const prompts = [...dialog.querySelectorAll('p, [class*="prompt"]')];
      return {
        categories: categories.map(c => c.textContent.trim()).filter(Boolean),
        prompts: prompts.map(p => p.textContent.trim()).filter(Boolean).slice(0, 8),
      };
    });

    await context.close();
    return { wsResults: results, domResults };

  } catch (e) {
    if (context) await context.close();
    return { wsResults: [], domResults: { categories: [], prompts: [] }, error: e.message };
  }
}

/**
 * @param {Object} shot — shot object (prompt, aspect, duration, loop)
 * @param {Buffer} imageBuffer — char ref image bytes
 * @param {string} imageExt — file extension (e.g. 'jpg', 'png')
 * @returns {{ id: string }} — Luma generation ID for polling
 */
export async function submitCharRefVideo(shot, imageBuffer, imageExt = 'jpg') {
  const tempPath = path.join(os.tmpdir(), `luma-charref-${Date.now()}.${imageExt}`);
  fs.writeFileSync(tempPath, imageBuffer);

  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();

    await page.goto(`${DREAM_MACHINE}/board/new`, { waitUntil: 'networkidle', timeout: 30000 });
    await dismissDialogs(page);

    // Switch to Keyframe tab
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Keyframe'
      );
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // Upload START FRAME
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      page.evaluate(() => {
        const el = [...document.querySelectorAll('[class*="cursor-pointer"]')].find(
          (e) => e.textContent.includes('start') && e.textContent.includes('frame')
        );
        if (el) el.click();
      }),
    ]);
    await fileChooser.setFiles(tempPath);
    await page.waitForTimeout(3000);

    // Configure settings
    await setGenerationSettings(page, {
      aspect: shot.aspect,
      duration: shot.duration,
      draft: false,
    });

    // Submit
    const generationId = await submitOnPage(page, shot.prompt);
    if (!generationId) {
      throw new Error('Generation submitted but could not capture generation ID from network');
    }

    return { id: generationId, state: 'queued' };

  } finally {
    if (context) await context.close();
    try { fs.unlinkSync(tempPath); } catch { /* best effort cleanup */ }
  }
}

// ─── Platform eyes — screenshot capture ─────────────────────────────────────

/**
 * Capture a screenshot of the current platform state.
 * @param {Object} options - { fullPage, clip, url }
 */
export async function captureScreenshot(options = {}) {
  let context = null;
  try {
    context = await launchContext({ viewport: { width: 1280, height: 800 } });
    const page = context.pages()[0] || await context.newPage();

    if (options.url) {
      await page.goto(options.url, { waitUntil: 'networkidle', timeout: 20000 });
    }

    const buffer = await page.screenshot({
      type: 'png',
      fullPage: options.fullPage || false,
      clip: options.clip || undefined,
    });

    const viewport = page.viewportSize();
    return {
      imageBase64: buffer.toString('base64'),
      width: viewport?.width || 1280,
      height: viewport?.height || 800,
    };
  } finally {
    if (context) await context.close();
  }
}

// ─── Phase 2B: New platform operations ──────────────────────────────────────

/**
 * Create a new board on the platform.
 * @param {string} name - Board name (used in URL)
 * @returns {{ boardId: string, url: string }}
 */
export async function createBoard(name) {
  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();

    await page.goto(`${DREAM_MACHINE}/board/new`, { waitUntil: 'networkidle', timeout: 30000 });
    await dismissDialogs(page);

    // Capture board ID from URL — /board/{id} pattern
    const url = page.url();
    const boardMatch = url.match(/\/board\/([^/?]+)/);
    const boardId = boardMatch?.[1] || null;

    // Set board name if the title is editable
    if (name) {
      try {
        const titleEl = page.locator('[contenteditable="true"]').first();
        if (await titleEl.isVisible({ timeout: 2000 })) {
          await titleEl.click();
          await titleEl.fill(name);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
        }
      } catch { /* title not editable, OK */ }
    }

    return { boardId, url: page.url() };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Submit a full generation on the platform (navigate to board, set settings, fill prompt, submit).
 * @param {Object} shot - Shot object with prompt, aspect, duration, etc.
 * @param {string} boardId - Board ID to navigate to
 * @returns {{ id: string, state: string }}
 */
export async function generateOnPlatform(shot, boardId) {
  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();

    const url = boardId
      ? `${DREAM_MACHINE}/board/${boardId}`
      : `${DREAM_MACHINE}/board/new`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await dismissDialogs(page);

    // Configure all settings
    await setGenerationSettings(page, {
      aspect: shot.aspect,
      duration: shot.duration,
      draft: shot.draft !== undefined ? shot.draft : false,
    });

    // Submit with prompt
    const generationId = await submitOnPage(page, shot.prompt);
    if (!generationId) {
      throw new Error('Platform generation: could not capture generation ID');
    }

    return { id: generationId, state: 'queued' };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Get full generation status from the photon/v2 internal API.
 * @param {string} genId - Generation ID
 * @returns {Object} Full generation status object
 */
export async function getGenerationStatus(genId) {
  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();
    // Use page.evaluate to make authenticated API call with platform cookies
    const result = await page.evaluate(async (id) => {
      const r = await fetch(
        `https://api.lumalabs.ai/api/photon/v2/generations/${id}`,
        { credentials: 'include' }
      );
      if (!r.ok) return { error: `HTTP ${r.status}` };
      return r.json();
    }, genId);
    return result;
  } finally {
    if (context) await context.close();
  }
}

/**
 * Extract a still frame from a completed generation.
 * @param {string} genId - Generation ID
 * @returns {{ url: string | null }}
 */
export async function extractStillFrame(genId) {
  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();
    const result = await page.evaluate(async (id) => {
      const r = await fetch(
        `https://api.lumalabs.ai/api/photon/v2/generations/${id}`,
        { credentials: 'include' }
      );
      if (!r.ok) return null;
      const data = await r.json();
      // Try last_frame first, then thumbnail
      return data.artifact?.last_frame?.url || data.artifact?.thumbnail?.url || null;
    }, genId);
    return { url: result };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Modify a completed generation with a new prompt.
 * Navigate to the generation, click Modify, enter new prompt, submit.
 * @param {string} genId - Generation ID
 * @param {string} prompt - New modification prompt
 * @param {string} boardId - Board ID (optional)
 * @returns {{ id: string, state: string }}
 */
export async function modifyGeneration(genId, prompt, boardId) {
  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();

    const url = boardId
      ? `${DREAM_MACHINE}/board/${boardId}/idea/${genId}`
      : `${DREAM_MACHINE}/idea/${genId}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await dismissDialogs(page);

    // Click Modify button
    const modifyBtn = page.locator('button').filter({ hasText: /modify/i }).first();
    if (await modifyBtn.isVisible({ timeout: 5000 })) {
      await modifyBtn.click();
      await page.waitForTimeout(1000);
    } else {
      throw new Error('Modify button not found on generation page');
    }

    // Submit modification
    const newGenId = await submitOnPage(page, prompt);
    if (!newGenId) throw new Error('Modify: could not capture new generation ID');
    return { id: newGenId, state: 'queued' };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Extend a completed generation (continue the video).
 * @param {string} genId - Generation ID
 * @param {string} boardId - Board ID (optional)
 * @returns {{ id: string, state: string }}
 */
export async function extendGeneration(genId, boardId) {
  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();

    const url = boardId
      ? `${DREAM_MACHINE}/board/${boardId}/idea/${genId}`
      : `${DREAM_MACHINE}/idea/${genId}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await dismissDialogs(page);

    // Click Extend button
    const extendBtn = page.locator('button').filter({ hasText: /extend/i }).first();
    if (await extendBtn.isVisible({ timeout: 5000 })) {
      await extendBtn.click();
      await page.waitForTimeout(1000);
    } else {
      throw new Error('Extend button not found on generation page');
    }

    // Capture new generation ID after extension
    let newGenId = null;
    interceptGenerationId(page, (id) => { newGenId = id; });

    // Submit extension (may auto-submit or need confirmation)
    const submitBtn = page.locator('button').filter({ hasText: /generate|create|submit/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 })) {
      await submitBtn.click();
    }

    const deadline = Date.now() + 15000;
    while (!newGenId && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    if (!newGenId) throw new Error('Extend: could not capture new generation ID');
    return { id: newGenId, state: 'queued' };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Download a completed generation video to disk.
 * Fetches the video URL from photon/v2, then downloads.
 * @param {string} genId - Generation ID
 * @param {string} destPath - Destination file path
 * @returns {{ path: string, url: string }}
 */
export async function downloadGeneration(genId, destPath) {
  let context;
  try {
    context = await launchContext();
    const page = await context.newPage();

    const videoUrl = await page.evaluate(async (id) => {
      const r = await fetch(
        `https://api.lumalabs.ai/api/photon/v2/generations/${id}`,
        { credentials: 'include' }
      );
      if (!r.ok) return null;
      const data = await r.json();
      return data.artifact?.video?.url || null;
    }, genId);

    if (!videoUrl) throw new Error(`No video URL found for generation ${genId}`);

    await context.close();
    context = null;

    await downloadFile(videoUrl, destPath);
    return { path: destPath, url: videoUrl };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Review a board — screenshot + extract generation statuses from DOM.
 * @param {string} boardId
 * @returns {{ imageBase64, generations: Array }}
 */
export async function reviewBoard(boardId) {
  let context;
  try {
    context = await launchContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(`${DREAM_MACHINE}/board/${boardId}`, {
      waitUntil: 'networkidle', timeout: 20000,
    });
    await dismissDialogs(page);
    await page.waitForTimeout(2000);

    // Screenshot
    const buffer = await page.screenshot({ type: 'png', fullPage: true });

    // Extract generation info from DOM
    const generations = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[class*="generation"], [class*="idea"], [class*="card"]')];
      return items.map(el => {
        const link = el.querySelector('a[href*="idea"]');
        const idMatch = link?.href?.match(/idea\/([^/?]+)/);
        const status = el.querySelector('[class*="status"], [class*="badge"]');
        return {
          id: idMatch?.[1] || null,
          status: status?.textContent?.trim() || 'unknown',
          text: el.textContent?.trim().slice(0, 100),
        };
      }).filter(g => g.id);
    });

    return {
      imageBase64: buffer.toString('base64'),
      generations,
    };
  } finally {
    if (context) await context.close();
  }
}
