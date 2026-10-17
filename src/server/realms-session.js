/**
 * REALMS SESSION
 *
 * Browser automation for app.lumalabs.ai ("Realms") — the new Luma platform.
 * Extends PlatformSession with Agent-centric interaction patterns.
 *
 * The core workflow shift from Dream Machine:
 *   BEFORE: Click mode buttons → upload frames → fill prompt bar → submit
 *   NOW:    Type natural language to Agent chat → Agent executes everything
 *
 * The Agent handles model selection, batching, iteration, post-production.
 * We just talk to it like a creative director talking to a team.
 *
 * Internal codename: "Realms"
 * Competition platform: app.lumalabs.ai
 * Auth: .realms-session/ (separate from Dream Machine .playwright-session/)
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';

const REALMS_SESSION_DIR = path.resolve(process.cwd(), '.realms-session');
const REALMS = 'https://app.lumalabs.ai';
// URL pattern confirmed from live audit: /board/[id] (not /realms/[id])

export class RealmsSession {
  constructor(options = {}) {
    this.context = null;
    this.page = null;
    this.headless = options.headless !== false;
    this.viewport = options.viewport || { width: 1440, height: 900 };
    this._acquired = false;
    this.boardId = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async acquire() {
    if (this._acquired && this.context && this.page) return;

    if (!fs.existsSync(REALMS_SESSION_DIR)) {
      fs.mkdirSync(REALMS_SESSION_DIR, { recursive: true });
    }

    this.context = await chromium.launchPersistentContext(REALMS_SESSION_DIR, {
      headless: this.headless,
      args: ['--no-sandbox'],
      viewport: this.viewport,
    });

    this.page = this.context.pages()[0] || await this.context.newPage();
    this._acquired = true;
  }

  async release() {
    if (this.context) {
      try { await this.context.close(); } catch { /* already closed */ }
    }
    this.context = null;
    this.page = null;
    this._acquired = false;
  }

  ensureAcquired() {
    if (!this._acquired || !this.page) {
      throw new Error('RealmsSession not acquired — call acquire() first');
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  async navigateToHome() {
    this.ensureAcquired();
    await this.page.goto(REALMS, { waitUntil: 'networkidle', timeout: 30000 });
    await this.dismissDialogs();
  }

  async navigateToBoard(boardId) {
    this.ensureAcquired();
    const url = boardId ? `${REALMS}/board/${boardId}` : REALMS;
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    this.boardId = boardId;
    await this.dismissDialogs();
    // Wait for agent panel to be ready after navigation
    await this.waitForAgentPanel();
  }

  async navigateToNewBoard() {
    this.ensureAcquired();
    await this.page.goto(REALMS, { waitUntil: 'networkidle', timeout: 30000 });
    await this.dismissDialogs();

    // If we landed on auth page, wait up to 3 minutes for the user to log in
    const currentUrl = this.page.url();
    const onAuthPage = currentUrl.includes('auth.lumalabs.ai') ||
      currentUrl.includes('sign-in') || currentUrl.includes('sign-up') ||
      !currentUrl.includes('app.lumalabs.ai');

    if (onAuthPage) {
      // Wait for user to log in and land on app.lumalabs.ai home or a board
      try {
        await this.page.waitForFunction(
          () => window.location.hostname === 'app.lumalabs.ai' &&
                !window.location.pathname.startsWith('/auth') &&
                !window.location.pathname.includes('sign'),
          { timeout: 180000 } // 3 minutes
        );
      } catch {
        throw new Error('Login timeout — please log in to app.lumalabs.ai in the browser window.');
      }
    }

    // Try multiple strategies to navigate to or create a board
    const strategies = [
      // 1. "+" new board button in the board list
      async () => {
        const btn = this.page.locator('button').filter({ hasText: /^\+$/ }).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          await this.page.waitForURL('**/board/**', { timeout: 15000 });
          return true;
        }
        return false;
      },
      // 2. Any link/button that says "New board" or "New Board"
      async () => {
        const btn = this.page.getByRole('button', { name: /new board/i }).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          await this.page.waitForURL('**/board/**', { timeout: 15000 });
          return true;
        }
        return false;
      },
      // 3. Navigate to first existing board link on the page
      async () => {
        const boardLink = this.page.locator('a[href*="/board/"]').first();
        if (await boardLink.isVisible({ timeout: 2000 })) {
          await boardLink.click();
          await this.page.waitForURL('**/board/**', { timeout: 15000 });
          return true;
        }
        return false;
      },
      // 4. Find any href with /board/ and navigate directly
      async () => {
        const boardHref = await this.page.evaluate(() => {
          const a = document.querySelector('a[href*="/board/"]');
          return a ? a.getAttribute('href') : null;
        });
        if (boardHref) {
          const boardUrl = boardHref.startsWith('http') ? boardHref : `https://app.lumalabs.ai${boardHref}`;
          await this.page.goto(boardUrl, { waitUntil: 'networkidle', timeout: 20000 });
          return true;
        }
        return false;
      },
    ];

    for (const strategy of strategies) {
      try {
        if (await strategy()) break;
      } catch { /* try next */ }
    }

    const url = this.page.url();
    const match = url.match(/\/board\/([^/?]+)/);
    this.boardId = match?.[1] || null;
    await this.dismissDialogs();
    // Wait for the agent panel to be ready
    await this.waitForAgentPanel();
    return this.boardId;
  }

  /**
   * Wait for the Luma Agent panel to be ready (textarea visible).
   * Called after any board navigation to ensure the UI has loaded.
   */
  async waitForAgentPanel(timeout = 15000) {
    this.ensureAcquired();
    const page = this.page;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      for (const check of [
        () => page.locator('[placeholder*="want to do"]').first(),
        () => page.getByPlaceholder('What do you want to do', { exact: false }).first(),
        () => page.getByRole('textbox').first(),
        () => page.locator('[contenteditable="true"]').first(),
      ]) {
        try {
          const el = check();
          if (await el.isVisible({ timeout: 500 })) return true;
        } catch { /* keep trying */ }
      }
      await page.waitForTimeout(1000);
    }
    // Timeout reached — panel may not be available, but don't throw
    return false;
  }

  async dismissDialogs() {
    try {
      const btn = this.page.locator('dialog button, [role="dialog"] button').first();
      if (await btn.isVisible({ timeout: 2000 })) await btn.click();
    } catch { /* no dialog */ }
  }

  // ── Agent Chat — Core Interface ─────────────────────────────────────────────

  /**
   * Locate the Agent chat input field.
   * The Agent panel is on the right side with "What do you want to do?" placeholder.
   */
  async getAgentInput() {
    this.ensureAcquired();
    const page = this.page;

    // Try multiple selector strategies for the Agent input
    // Confirmed from live audit 2026-03-16:
    // The Agent input is a textbox with placeholder "What do you want to do?"
    // Located in the right-side panel (not inside tldraw canvas)
    const selectors = [
      'textbox[placeholder*="What do you want to do"]',
      '[placeholder="What do you want to do?"]',
      'textarea[placeholder*="What do you want"]',
      '[placeholder*="want to do"]',
      // Fallback
      '[class*="chat"] textarea',
      '[class*="agent"] textarea',
    ];

    for (const selector of selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 1000 })) return el;
      } catch { /* try next */ }
    }

    // Try role-based (works for div[role="textbox"] which Luma uses)
    try {
      const byPlaceholder = page.getByPlaceholder('What do you want to do', { exact: false }).first();
      if (await byPlaceholder.isVisible({ timeout: 2000 })) return byPlaceholder;
    } catch { /* try next */ }

    // The agent input is the FIRST textbox on the page (role="textbox", div contenteditable)
    // The second textbox is the "agent" mode label — don't use .last()
    try {
      const byRole = page.getByRole('textbox').first();
      if (await byRole.isVisible({ timeout: 2000 })) return byRole;
    } catch { /* try next */ }

    return page.locator('[contenteditable="true"]').first();
  }

  /**
   * Submit a natural language prompt to the Agent.
   * This is the primary interaction — everything goes through here.
   *
   * @param {string} prompt - Natural language instruction
   * @param {Object} options - { waitForResponse, timeout }
   * @returns {Promise<string>} Agent response text (if waitForResponse)
   */
  async prompt(message, options = {}) {
    this.ensureAcquired();
    const page = this.page;
    const timeout = options.timeout || 30000;

    // Set up generation ID interception before typing
    const capturePromise = options.captureGenId
      ? this.interceptNextGeneration(timeout)
      : null;

    // Get input and type
    // Luma uses div[role="textbox"] (contenteditable) — use fill() which works for role=textbox
    const input = await this.getAgentInput();
    await input.click();
    await input.fill(message);
    await page.waitForTimeout(500);

    // Submit — Luma's send button has no type="submit" or aria-label, just a plain button
    // Most reliable: look for any enabled button near the input, fallback to Enter key
    let submitted = false;

    // Try the send button — it's near the input, enabled after typing
    try {
      // Wait briefly for send button to become enabled after fill
      await page.waitForTimeout(200);
      const sendSelectors = [
        'button[type="submit"]',
        'button[aria-label*="send" i]',
        'button[aria-label*="submit" i]',
      ];
      for (const sel of sendSelectors) {
        try {
          const btn = page.locator(sel).last();
          if (await btn.isEnabled({ timeout: 500 })) {
            await btn.click();
            submitted = true;
            break;
          }
        } catch { /* try next */ }
      }
    } catch { /* fall through to Enter */ }

    // Primary fallback: Enter key (most reliable for chat inputs)
    if (!submitted) {
      await input.press('Enter');
    }

    // Return captured generation ID if requested
    if (capturePromise) {
      return capturePromise;
    }

    // Optionally wait for Agent response in chat
    if (options.waitForResponse) {
      await page.waitForTimeout(2000); // Let Agent start responding
      return this.getLastAgentResponse();
    }

    return null;
  }

  /**
   * Get the most recent Agent response text from the chat panel.
   */
  async getLastAgentResponse() {
    this.ensureAcquired();
    const page = this.page;

    try {
      const responses = page.locator('[class*="message"][class*="agent"], [data-role="assistant"], [class*="response"]');
      const count = await responses.count();
      if (count === 0) return null;
      return responses.nth(count - 1).textContent();
    } catch {
      return null;
    }
  }

  /**
   * Upload an image file to attach to the Agent conversation.
   * Used for reference images, keyframes, character sheets, etc.
   *
   * @param {string} imagePath - Absolute path to image file
   */
  async attachImage(imagePath) {
    this.ensureAcquired();
    const page = this.page;

    // Look for image attachment button in the Agent panel
    const uploadSelectors = [
      'button[aria-label*="attach" i]',
      'button[aria-label*="image" i]',
      'input[type="file"]',
      '[class*="attach"] button',
      '[class*="upload"] button',
    ];

    for (const sel of uploadSelectors) {
      try {
        if (sel === 'input[type="file"]') {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 3000 }),
            page.locator('label[for*="file"], button').filter({ hasText: /attach|image|upload/i }).first().click(),
          ]);
          await fileChooser.setFiles(imagePath);
          await page.waitForTimeout(2000);
          return;
        }
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }),
            btn.click(),
          ]);
          await fileChooser.setFiles(imagePath);
          await page.waitForTimeout(2000);
          return;
        }
      } catch { /* try next */ }
    }

    // Last resort: drag file onto canvas
    console.warn('Could not find image upload button — trying drag to canvas');
  }

  // ── Generation Capture ─────────────────────────────────────────────────────

  /**
   * Intercept the next generation ID from the Realms API.
   * Returns a promise that resolves with the captured ID.
   */
  interceptNextGeneration(timeoutMs = 60000) {
    this.ensureAcquired();
    const page = this.page;

    return new Promise((resolve, reject) => {
      let captured = false;
      const timer = setTimeout(() => {
        if (!captured) reject(new Error('Generation ID capture timeout'));
      }, timeoutMs);

      const handler = async (response) => {
        if (captured) return;
        const url = response.url();
        // Realms API endpoints (may differ from Dream Machine)
        if (
          (url.includes('/generations') || url.includes('/generate') || url.includes('/create')) &&
          response.request().method() === 'POST'
        ) {
          try {
            const body = await response.json();
            const id = body?.id || body?.generation_id || body?.data?.id;
            if (id) {
              captured = true;
              clearTimeout(timer);
              page.off('response', handler);
              resolve(id);
            }
          } catch { /* not a generation response */ }
        }
      };

      page.on('response', handler);
    });
  }

  /**
   * Get all generation IDs currently on the canvas by scraping the DOM.
   */
  async getCanvasGenerations() {
    this.ensureAcquired();
    return this.page.evaluate(() => {
      // Look for asset elements with data attributes
      const assets = [...document.querySelectorAll('[data-id], [data-generation-id], [class*="asset"], [class*="media"]')];
      return assets.map(el => ({
        id: el.getAttribute('data-id') || el.getAttribute('data-generation-id'),
        type: el.tagName.toLowerCase(),
        src: el.querySelector('img, video')?.src || el.src,
      })).filter(a => a.id);
    });
  }

  /**
   * Wait for new assets to appear on the canvas after a generation.
   * @param {number} previousCount - Canvas asset count before generation
   * @param {Object} options - { timeout, pollInterval }
   */
  async waitForNewAssets(previousCount, options = {}) {
    const timeout = options.timeout || 180000;
    const poll = options.pollInterval || 3000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const current = await this.getCanvasGenerations();
      if (current.length > previousCount) {
        return current.slice(previousCount); // Return new ones
      }
      await new Promise(r => setTimeout(r, poll));
    }

    throw new Error('Timeout waiting for new canvas assets');
  }

  // ── Authenticated API Calls ────────────────────────────────────────────────

  async apiCall(url, options = {}) {
    this.ensureAcquired();
    return this.page.evaluate(async ({ url, options }) => {
      const r = await fetch(url, { credentials: 'include', ...options });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      return r.json();
    }, { url, options });
  }

  async getGenerationStatus(generationId) {
    // Try Realms API endpoint (may differ from Dream Machine)
    const data = await this.apiCall(
      `https://api.lumalabs.ai/api/photon/v2/generations/${generationId}`
    );
    return data;
  }

  async getVideoUrl(generationId) {
    const data = await this.getGenerationStatus(generationId);
    return data?.artifact?.video?.url || null;
  }

  // ── Canvas Interaction ─────────────────────────────────────────────────────

  async screenshot(options = {}) {
    this.ensureAcquired();

    // Type: jpeg for SSE stream (3-5x smaller than PNG, adequate for monitoring)
    //       png for keyframe captures or when lossless is needed
    const type = options.type || 'jpeg';

    return this.page.screenshot({
      type,
      quality: type === 'jpeg' ? (options.quality ?? 80) : undefined,
      fullPage: options.fullPage ?? false,
      scale: options.scale ?? 'css',          // CSS pixels — correct for HiDPI displays
      animations: 'disabled',                  // stop animations for cleaner frame
      timeout: options.timeout ?? 10000,
      ...(options.clip ? { clip: options.clip } : {}),
    });
  }

  // Higher-quality screenshot for asset capture (War Room keyframe/evaluation use)
  async screenshotHQ(options = {}) {
    return this.screenshot({ type: 'png', scale: 'device', ...options });
  }

  async getCurrentUrl() {
    this.ensureAcquired();
    return this.page.url();
  }

  /**
   * Check if session is authenticated on app.lumalabs.ai
   */
  async checkAuth() {
    try {
      await this.acquire();
      await this.page.goto(REALMS, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const url = this.page.url();
      const loggedIn = url.includes('app.lumalabs.ai') &&
        !url.includes('auth.lumalabs.ai') &&
        !url.includes('sign-up') &&
        !url.includes('sign-in') &&
        !url.includes('login');
      return { loggedIn, url };
    } catch (e) {
      return { loggedIn: false, error: e.message };
    }
  }
}

// ── Download helper ────────────────────────────────────────────────────────────

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
      file.on('error', (e) => { try { fs.unlinkSync(destPath); } catch {} reject(e); });
    }).on('error', reject);
  });
}

// ── Session check (standalone) ─────────────────────────────────────────────────

export async function checkRealmsSession() {
  const session = new RealmsSession({ headless: true });
  try {
    return await session.checkAuth();
  } finally {
    await session.release();
  }
}

// ── Open login browser ─────────────────────────────────────────────────────────

export async function openRealmsLogin() {
  const session = new RealmsSession({ headless: false, viewport: { width: 1280, height: 800 } });
  try {
    await session.acquire();
    await session.page.goto(REALMS, { waitUntil: 'domcontentloaded' });

    // Wait until fully past auth — home dashboard or a board URL
    // /auth/callback is an intermediate step, not the final destination
    try {
      await session.page.waitForFunction(
        () => window.location.hostname === 'app.lumalabs.ai' &&
              !window.location.pathname.startsWith('/auth') &&
              !window.location.pathname.includes('sign-in') &&
              !window.location.pathname.includes('sign-up') &&
              (window.location.pathname === '/' || window.location.pathname.startsWith('/board')),
        { timeout: 300000 }
      );
      // Give the page 2s to write final session cookies before closing
      await new Promise(r => setTimeout(r, 2000));
      return { success: true };
    } catch {
      return { success: false, error: 'Login timeout' };
    }
  } finally {
    await session.release();
  }
}
