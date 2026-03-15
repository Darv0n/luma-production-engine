/**
 * LUMA PLATFORM AUTOMATION
 *
 * Server-side Playwright automation for the Dream Machine platform.
 * Used for character reference video submissions — the only workflow
 * that cannot be done through the public API.
 *
 * Session is persisted to .playwright-session/ so the user only
 * needs to log in once.
 *
 * Flow:
 *   checkSession()          → is the saved session still logged in?
 *   openLoginBrowser()      → open visible browser, user logs in, session saved
 *   submitCharRefVideo()    → Keyframe tab + START FRAME upload + prompt + submit
 *                             Returns { id } captured from network interception
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';

const SESSION_DIR = path.resolve(process.cwd(), '.playwright-session');
const DREAM_MACHINE = 'https://dream-machine.lumalabs.ai';

// ─── Model mapping ────────────────────────────────────────────────────────────
const ASPECT_LABELS = {
  '16:9': '16:9', '9:16': '9:16', '1:1': '1:1',
  '4:3': '4:3', '3:4': '3:4', '21:9': '21:9',
};

const DURATION_LABELS = {
  '5s': '5s', '9s': '9s', '10s': '9s',
};

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
  let generationId = null;
  let context;

  try {
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true, args: ['--no-sandbox'],
    });
    const page = await context.newPage();

    // Capture generation ID from network
    page.on('response', async (response) => {
      if (response.url().includes('/generations') && response.request().method() === 'POST' && !generationId) {
        try {
          const body = await response.json();
          if (body?.id) generationId = body.id;
        } catch { /* not a generation response */ }
      }
    });

    await page.goto(`${DREAM_MACHINE}/board/new`, { waitUntil: 'networkidle', timeout: 30000 });

    // Dismiss dialogs
    try { const btn = page.locator('dialog button').first(); if (await btn.isVisible({ timeout: 2000 })) await btn.click(); } catch { /* none */ }

    // Fill prompt
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const kf = btns.find(b => b.textContent.trim() === 'Keyframe');
      if (kf) kf.click();
    });
    await page.waitForTimeout(500);

    // Upload keyframe if provided
    if (keyframeImageUrl) {
      // Fetch the image and set it as start frame
      const imgResp = await page.evaluate(async (url) => {
        const r = await fetch(url);
        const blob = await r.blob();
        return URL.createObjectURL(blob);
      }, keyframeImageUrl);

      const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        page.evaluate(() => {
          const el = [...document.querySelectorAll('[class*="cursor-pointer"]')].find(
            e => e.textContent.includes('start') && e.textContent.includes('frame')
          );
          if (el) el.click();
        }),
      ]);
      // For URL-based keyframes, we need to download and upload
      // Skip file chooser, close it
    }

    // Fill prompt
    const textarea = page.locator('textarea, [contenteditable="true"]').first();
    await textarea.click();
    await textarea.fill(shot.prompt);
    await page.waitForTimeout(300);

    // Set model to reasoning — click model selector and find ray-v3-reasoning
    const modelBtn = page.locator('button').filter({ hasText: /video.*Ray/i }).first();
    if (await modelBtn.isVisible({ timeout: 3000 })) {
      await modelBtn.click();
      await page.waitForTimeout(500);
      // Look for reasoning option
      const reasoningBtn = page.locator('button, [role="option"]').filter({ hasText: /reasoning/i }).first();
      if (await reasoningBtn.isVisible({ timeout: 2000 })) {
        await reasoningBtn.click();
      }
      await page.keyboard.press('Escape');
    }

    // Submit
    await page.evaluate(() => {
      const toolbar = document.querySelector('[class*="composer"]') || document.body;
      const btns = [...toolbar.querySelectorAll('button:not([disabled])')];
      if (btns.length) btns[btns.length - 1].click();
    });

    const deadline = Date.now() + 15000;
    while (!generationId && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

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
  // Write image buffer to temp file
  const tempPath = path.join(os.tmpdir(), `luma-charref-${Date.now()}.${imageExt}`);
  fs.writeFileSync(tempPath, imageBuffer);

  let generationId = null;
  let context;

  try {
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: true,
      args: ['--no-sandbox'],
    });

    const page = await context.newPage();

    // Intercept Luma generation API responses to capture the generation ID
    page.on('response', async (response) => {
      if (
        response.url().includes('/generations') &&
        response.request().method() === 'POST' &&
        !generationId
      ) {
        try {
          const body = await response.json();
          if (body?.id) generationId = body.id;
        } catch {
          // not JSON or no id field
        }
      }
    });

    // ── Navigate to new board ──────────────────────────────────────────────
    await page.goto(`${DREAM_MACHINE}/board/new`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Dismiss any announcement dialogs
    try {
      const closeBtn = page.locator('dialog button').first();
      if (await closeBtn.isVisible({ timeout: 2000 })) await closeBtn.click();
    } catch { /* no dialog */ }

    // ── Switch to Keyframe tab ─────────────────────────────────────────────
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Keyframe'
      );
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // ── Upload START FRAME (char ref image) ────────────────────────────────
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

    // Wait for upload to complete (thumbnail appears)
    await page.waitForTimeout(3000);

    // ── Fill prompt ────────────────────────────────────────────────────────
    const textarea = page.locator('textarea, [contenteditable="true"]').first();
    await textarea.click();
    await textarea.fill(shot.prompt);
    await page.waitForTimeout(300);

    // ── Configure generation settings ─────────────────────────────────────
    // Open model selector
    const modelBtn = page.locator('button').filter({ hasText: /Keyframe.*video.*Ray3/i }).first();
    if (await modelBtn.isVisible({ timeout: 3000 })) {
      await modelBtn.click();
      await page.waitForTimeout(500);

      // Disable Draft mode if it's on (we want full quality)
      const draftToggle = page.locator('button').filter({ hasText: /draft/i }).first();
      if (await draftToggle.isVisible({ timeout: 2000 })) {
        // Check if draft is active and toggle it off
        const isDraft = await draftToggle.evaluate((el) =>
          el.classList.contains('active') ||
          el.getAttribute('aria-pressed') === 'true' ||
          el.getAttribute('data-state') === 'on'
        );
        if (isDraft) await draftToggle.click();
      }

      // Set aspect ratio
      const aspectLabel = ASPECT_LABELS[shot.aspect] || '16:9';
      const aspectBtn = page.locator('button').filter({ hasText: aspectLabel }).first();
      if (await aspectBtn.isVisible({ timeout: 2000 })) await aspectBtn.click();

      // Set duration
      const durLabel = DURATION_LABELS[shot.duration] || '5s';
      const durBtn = page.locator('button').filter({ hasText: durLabel }).first();
      if (await durBtn.isVisible({ timeout: 2000 })) await durBtn.click();

      // Close settings panel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // ── Submit generation ──────────────────────────────────────────────────
    // Submit button is the last enabled button in the composer toolbar
    const submitBtn = page.locator('button[type="submit"], form button').last();
    const fallbackSubmit = page.locator('button').filter({ hasText: /generate|create/i }).last();

    if (await submitBtn.isEnabled({ timeout: 3000 })) {
      await submitBtn.click();
    } else if (await fallbackSubmit.isVisible({ timeout: 1000 })) {
      await fallbackSubmit.click();
    } else {
      // Last resort: find the arrow-up / send button by position in toolbar
      await page.evaluate(() => {
        const toolbar = document.querySelector('[class*="composer"]') ||
                        document.querySelector('[class*="input"]');
        if (!toolbar) return;
        const btns = [...toolbar.querySelectorAll('button:not([disabled])')];
        if (btns.length) btns[btns.length - 1].click();
      });
    }

    // ── Wait for generation ID to be captured ─────────────────────────────
    const deadline = Date.now() + 15000;
    while (!generationId && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    if (!generationId) {
      throw new Error('Generation submitted but could not capture generation ID from network');
    }

    return { id: generationId, state: 'queued' };

  } finally {
    if (context) await context.close();
    try { fs.unlinkSync(tempPath); } catch { /* best effort cleanup */ }
  }
}
