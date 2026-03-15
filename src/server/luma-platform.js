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
