/**
 * PLATFORM SESSION
 *
 * Manages a single persistent browser context for the duration of a
 * production run. Every platform operation in an Auteur session reuses
 * this context instead of launching/closing Chromium 15+ times.
 *
 * Lifecycle:
 *   const session = new PlatformSession();
 *   await session.acquire();          // launch browser once
 *   await session.navigateToBoard(id); // reuse the same page
 *   // ... run operations ...
 *   await session.release();          // close browser once
 */

import { chromium } from 'playwright';
import path from 'path';

const SESSION_DIR = path.resolve(process.cwd(), '.playwright-session');
const DREAM_MACHINE = 'https://dream-machine.lumalabs.ai';

export class PlatformSession {
  constructor(options = {}) {
    this.context = null;
    this.page = null;
    this.headless = options.headless !== false;
    this.viewport = options.viewport || { width: 1280, height: 800 };
    this._acquired = false;
  }

  /**
   * Launch the persistent browser context and create a page.
   * Safe to call multiple times — idempotent.
   */
  async acquire() {
    if (this._acquired && this.context && this.page) return;

    this.context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: this.headless,
      args: ['--no-sandbox'],
      viewport: this.viewport,
    });

    // Reuse existing page or create new
    this.page = this.context.pages()[0] || await this.context.newPage();
    this._acquired = true;
  }

  /**
   * Close the browser context. Always call in a finally block.
   */
  async release() {
    if (this.context) {
      try { await this.context.close(); } catch { /* already closed */ }
    }
    this.context = null;
    this.page = null;
    this._acquired = false;
  }

  /**
   * Ensure session is alive. Throws if not acquired.
   */
  ensureAcquired() {
    if (!this._acquired || !this.page) {
      throw new Error('PlatformSession not acquired — call acquire() first');
    }
  }

  /**
   * Navigate to a board by ID. Reuses the existing page.
   */
  async navigateToBoard(boardId) {
    this.ensureAcquired();
    const url = boardId
      ? `${DREAM_MACHINE}/board/${boardId}`
      : `${DREAM_MACHINE}/board/new`;
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await this.dismissDialogs();
  }

  /**
   * Navigate to a specific idea/generation within a board or globally.
   */
  async navigateToIdea(generationId, boardId) {
    this.ensureAcquired();
    const url = boardId
      ? `${DREAM_MACHINE}/board/${boardId}/idea/${generationId}`
      : `${DREAM_MACHINE}/idea/${generationId}`;
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await this.dismissDialogs();
  }

  /**
   * Navigate to the Ideas page.
   */
  async navigateToIdeas() {
    this.ensureAcquired();
    await this.page.goto(`${DREAM_MACHINE}/ideas`, {
      waitUntil: 'networkidle', timeout: 20000,
    });
    await this.dismissDialogs();
  }

  /**
   * Dismiss announcement/promo dialogs.
   */
  async dismissDialogs() {
    try {
      const btn = this.page.locator('dialog button').first();
      if (await btn.isVisible({ timeout: 2000 })) await btn.click();
    } catch { /* no dialog */ }
  }

  /**
   * Set generation settings (model, aspect, duration, draft toggle).
   * Opens the settings dialog, applies, and closes it.
   */
  async setSettings(settings = {}) {
    this.ensureAcquired();
    const page = this.page;

    const modelBtn = page.locator('button').filter({ hasText: /video.*Ray|Keyframe.*video/i }).first();
    if (!await modelBtn.isVisible({ timeout: 3000 })) return;

    await modelBtn.click();
    await page.waitForTimeout(500);

    // Model selection
    if (settings.model) {
      const modelOption = page.locator('button, [role="option"]')
        .filter({ hasText: new RegExp(settings.model, 'i') }).first();
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
      const aspectBtn = page.locator('button').filter({ hasText: settings.aspect }).first();
      if (await aspectBtn.isVisible({ timeout: 2000 })) await aspectBtn.click();
    }

    // Duration
    if (settings.duration) {
      const durBtn = page.locator('button').filter({ hasText: settings.duration }).first();
      if (await durBtn.isVisible({ timeout: 2000 })) await durBtn.click();
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  /**
   * Set up network interception to capture generation IDs.
   * Returns a promise that resolves with the captured ID.
   */
  interceptGeneration(timeoutMs = 30000) {
    this.ensureAcquired();
    const page = this.page;

    return new Promise((resolve, reject) => {
      let captured = false;
      const timer = setTimeout(() => {
        if (!captured) reject(new Error('Generation ID capture timeout'));
      }, timeoutMs);

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
              clearTimeout(timer);
              resolve(body.id);
            }
          } catch { /* not a generation response */ }
        }
      });
    });
  }

  /**
   * Fill prompt in the active prompt bar and submit.
   * Returns the captured generation ID.
   */
  async submitPrompt(prompt, timeoutMs = 30000) {
    this.ensureAcquired();
    const page = this.page;

    const capturePromise = this.interceptGeneration(timeoutMs);

    // Fill prompt
    const textarea = page.locator('textarea, [contenteditable="true"]').first();
    await textarea.click();
    await textarea.fill(prompt);
    await page.waitForTimeout(300);

    // Submit — try the send/submit button
    const sendBtn = page.locator('button[type="submit"]').last();
    const enabledSend = page.locator('button:not([disabled])').last();

    if (await sendBtn.isEnabled({ timeout: 2000 })) {
      await sendBtn.click();
    } else {
      // Fallback: find last enabled button in the prompt bar area
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
        const lastInput = inputs[inputs.length - 1];
        if (!lastInput) return;
        const container = lastInput.closest('[class*="composer"], [class*="prompt"], [class*="input"]')
          || lastInput.parentElement?.parentElement;
        if (!container) return;
        const btns = [...container.querySelectorAll('button:not([disabled])')];
        if (btns.length) btns[btns.length - 1].click();
      });
    }

    return capturePromise;
  }

  /**
   * Upload a file to a frame slot (start frame or end frame chiclet).
   * @param {'start' | 'end'} slot - Which frame slot to upload to
   * @param {string} imagePath - Absolute path to image file
   */
  async uploadToFrameSlot(slot, imagePath) {
    this.ensureAcquired();
    const page = this.page;

    const slotText = slot === 'start' ? 'start' : 'end';

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      page.evaluate((text) => {
        const els = [...document.querySelectorAll('[class*="cursor-pointer"], button')];
        const target = els.find(
          (e) => e.textContent.toLowerCase().includes(text) &&
                 e.textContent.toLowerCase().includes('frame')
        );
        if (target) target.click();
      }, slotText),
    ]);

    await fileChooser.setFiles(imagePath);
    await page.waitForTimeout(3000); // wait for upload + thumbnail render
  }

  /**
   * Switch to a specific creation mode tab (Describe, Keyframe, Reference, Modify).
   */
  async switchMode(mode) {
    this.ensureAcquired();
    const page = this.page;

    const modeBtn = page.locator('button').filter({ hasText: new RegExp(`^${mode}$`, 'i') }).first();
    if (await modeBtn.isVisible({ timeout: 3000 })) {
      await modeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  /**
   * Click a post-production action button on an idea detail page.
   * @param {'Modify' | 'Extend Video' | 'Reframe' | 'Upscale' | 'Audio'} action
   */
  async clickAction(action) {
    this.ensureAcquired();
    const page = this.page;

    const btn = page.locator('button').filter({ hasText: new RegExp(action, 'i') }).first();
    if (await btn.isVisible({ timeout: 5000 })) {
      await btn.click();
      await page.waitForTimeout(1000);
    } else {
      throw new Error(`Action button "${action}" not found on page`);
    }
  }

  /**
   * Make an authenticated API call using the platform's cookies.
   * Runs fetch inside the browser context.
   */
  async apiCall(url, options = {}) {
    this.ensureAcquired();
    return this.page.evaluate(async ({ url, options }) => {
      const r = await fetch(url, { credentials: 'include', ...options });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      return r.json();
    }, { url, options });
  }

  /**
   * Get generation status from photon/v2 API.
   */
  async getGenerationStatus(generationId) {
    return this.apiCall(
      `https://api.lumalabs.ai/api/photon/v2/generations/${generationId}`
    );
  }

  /**
   * Get last frame URL from a completed generation.
   */
  async getLastFrameUrl(generationId) {
    const data = await this.getGenerationStatus(generationId);
    return data?.artifact?.last_frame?.url || null;
  }

  /**
   * Get video URL from a completed generation.
   */
  async getVideoUrl(generationId) {
    const data = await this.getGenerationStatus(generationId);
    return data?.artifact?.video?.url || null;
  }

  /**
   * Take a screenshot of the current page state.
   * @returns {Buffer} PNG screenshot buffer
   */
  async screenshot(options = {}) {
    this.ensureAcquired();
    return this.page.screenshot({
      type: 'png',
      fullPage: options.fullPage || false,
    });
  }
}
