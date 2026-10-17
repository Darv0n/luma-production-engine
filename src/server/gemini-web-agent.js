/**
 * GEMINI WEB AGENT
 *
 * Vision-action loop for autonomous Luma Realms traversal.
 * Gemini sees screenshots + DOM snapshots, reasons about what to do,
 * Playwright executes, loop repeats until goal achieved or max steps.
 *
 * Persona: Deep Luma Realms platform knowledge + auteur's critic.
 * Gemini holds the creative vision and evaluates everything against it.
 * It knows models, their quality tiers, platform patterns, prompt rules.
 * It does not flatter. Its criticism is what makes the work better.
 *
 * Loop:
 *   1. Observe (screenshot + DOM: frame headings, image alts, chat state)
 *   2. Reason (Gemini Vision: what do I see? what matters? what next?)
 *   3. Act (Playwright executes)
 *   4. Emit step to onStep callback
 *   5. Repeat until done or maxSteps
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ─── Platform knowledge injected into every traversal ───────────────────────

const LUMA_PLATFORM_KNOWLEDGE = `
## Luma Realms Platform Knowledge

**Architecture**: tldraw infinite canvas + right-side AI Agent panel
**URL pattern**: app.lumalabs.ai/board/{uuid}
**Canvas objects**: Images (alt text = generation prompt), Videos, Audio, Frames (containers with headings), Text notes, Sticky notes
**Frame naming**: "{Shot N} {Type} — {Description}" (agent names these automatically)
**Image alt texts**: ALWAYS contain the exact generation prompt — read these to know what was generated

**Model Quality Tiers** (know these cold):
Image: Nano Banana (standard) → Nano Banana Pro (premium, Gemini-based) → Seedream / GPT Image 1.5 (external)
Video: Ray3.14 (standard) → Ray3.14 HDR (premium, richer color/dynamic range) → Sora 2 / Veo 3 / Veo 3.1 / Kling 3.0 / Kling 2.6 (external)
Audio: ElevenLabs v3 (speech) + Music + Sound Effects

**Agent workflow patterns**:
- Agent creates plans (e.g., "0/6" → "1/6") — shows progress in chat
- Direction gates: agent pauses and asks human to choose direction
- Batch + QA: multiple variations generated, scored internally
- Style cascade: approved direction used as ref for subsequent shots

**Prompt rules** (critique violations):
- Positive prompting only (no "no X" or "avoid X")
- 20-40 words optimal — under 20: model guesses; over 50: model ignores
- One subject, one action, one camera move
- Secondary motion is non-negotiable quality signal (wind, fabric, particles, reflections)
- Shot type is the highest-leverage word (ECU, MCU, wide, aerial, etc.)
- Dead words waste budget: vibrant, cinematic, stunning, beautiful, amazing, masterpiece
`;

// ─── GeminiWebAgent ──────────────────────────────────────────────────────────

export class GeminiWebAgent {
  constructor(geminiKey, options = {}) {
    this.geminiKey = geminiKey;
    this.model = options.model || 'gemini-2.5-flash';
    this.maxSteps = options.maxSteps || 18;
    this.extraPersona = options.persona || ''; // Project-specific vision injected by caller
    this.onStep = options.onStep || null;      // (stepInfo) => void — emits to War Room
  }

  // ── Main loop ───────────────────────────────────────────────────────────

  async traverse(page, goal) {
    const history = [];
    const findings = [];

    for (let step = 0; step < this.maxSteps; step++) {
      // Observe: screenshot + DOM
      const { screenshotB64, domSnapshot } = await this.observe(page);

      // Reason: Gemini vision → structured action
      const action = await this.reason(screenshotB64, domSnapshot, goal, history, this.maxSteps - step);

      // Notify caller of this step (War Room emits a dialogue turn)
      if (this.onStep) {
        this.onStep({
          step: step + 1,
          action,
          screenshotB64,
        });
      }

      // Track history
      history.push({
        step: step + 1,
        action: action.action,
        description: action.description || action.finding || action.reasoning || '',
      });

      // Collect findings
      if (action.finding) findings.push(action.finding);

      // Done?
      if (action.action === 'done') {
        return {
          ok: true,
          steps: step + 1,
          summary: action.summary || 'Scout complete.',
          critique: action.critique || '',
          findings: [...findings, ...(action.findings || [])],
          screenshotB64,
          history,
        };
      }

      // Execute DOM action
      if (action.action !== 'observe') {
        try {
          await this.execute(page, action);
          await page.waitForTimeout(700);
        } catch (e) {
          history.push({ step: step + 1, error: e.message });
          // Non-fatal — bad click, element moved, etc.
        }
      }
    }

    // Max steps reached without done
    const finalScreenshot = await page.screenshot({ type: 'png' }).then(b => b.toString('base64')).catch(() => null);
    return {
      ok: true,
      steps: this.maxSteps,
      summary: `Scout reached max steps (${this.maxSteps}). See findings.`,
      critique: '',
      findings,
      screenshotB64: finalScreenshot,
      history,
    };
  }

  // ── Observe: screenshot + DOM snapshot ─────────────────────────────────

  async observe(page) {
    const buf = await page.screenshot({ type: 'png' });
    const screenshotB64 = buf.toString('base64');

    const domSnapshot = await page.evaluate(() => {
      // Frame titles (agent names them descriptively)
      const frames = [...document.querySelectorAll('[role="heading"]')]
        .map(el => el.textContent?.trim()).filter(t => t && t.length > 2);

      // Image alt texts = generation prompts
      const images = [...document.querySelectorAll('img[alt]')]
        .map(el => el.getAttribute('alt')?.trim())
        .filter(t => t && t.length > 8);

      // Buttons visible in the toolbar / context
      const buttons = [...document.querySelectorAll('button:not([aria-hidden="true"])]')]
        .map(el => el.textContent?.trim()).filter(t => t && t.length < 40 && t.length > 1);

      // Agent chat text (plan state, recent messages)
      const chatText = document.querySelector('[placeholder*="want to do"]')?.closest('[class*="panel"]')?.textContent?.slice(0, 600) || '';

      return {
        frames: frames.slice(0, 20),
        images: images.slice(0, 12),
        buttons: [...new Set(buttons)].slice(0, 15),
        chatText: chatText.slice(0, 600),
        url: window.location.href,
      };
    }).catch(() => ({ frames: [], images: [], buttons: [], chatText: '', url: '' }));

    return { screenshotB64, domSnapshot };
  }

  // ── Reason: Gemini Vision → action JSON ────────────────────────────────

  async reason(screenshotB64, domSnapshot, goal, history, remainingSteps) {
    const historyText = history.length
      ? history.map(h => `Step ${h.step}: [${h.action}] ${h.description}${h.error ? ` ERROR: ${h.error}` : ''}`).join('\n')
      : 'None yet.';

    const domText = domSnapshot ? `
FRAME HEADINGS ON CANVAS: ${domSnapshot.frames.join(' | ') || 'none found'}
IMAGE PROMPTS ON CANVAS (from alt texts): ${domSnapshot.images.join(' | ') || 'none found'}
AGENT CHAT STATE: ${domSnapshot.chatText || 'not available'}
CURRENT URL: ${domSnapshot.url}` : '';

    const prompt = `${LUMA_PLATFORM_KNOWLEDGE}
${this.extraPersona ? `\n## PROJECT VISION\n${this.extraPersona}` : ''}

---

You are COUNSEL — the auteur's critic. You are scouting a Luma Realms board.

SCOUTING GOAL: ${goal}

STEPS TAKEN SO FAR:
${historyText}

STEPS REMAINING: ${remainingSteps}
${domText}

Analyze the screenshot carefully. You can see the tldraw canvas with its frames, assets, and the agent panel on the right.

Return your NEXT action as JSON. Choose exactly one:

To click something: {"action":"click","target":"exact visible text of element","description":"why","reasoning":"what I see"}
To scroll down: {"action":"scroll","direction":"down","amount":400,"description":"why"}
To scroll up: {"action":"scroll","direction":"up","amount":400,"description":"why"}
To hover (reveal tooltip/menu): {"action":"hover","target":"exact visible text","description":"why"}
To press a key: {"action":"key","key":"Escape","description":"why"}
To record a finding without acting: {"action":"observe","finding":"specific critical observation","description":"what this means for the vision"}
To finish scouting: {"action":"done","summary":"full scout summary","findings":["finding 1","finding 2"],"critique":"your overall critique of the board state vs the vision"}

CRITICAL RULES:
- Return ONLY valid JSON. No markdown. No preamble.
- When finding model choices, evaluate them against quality tiers and the vision
- When reading image alt texts, analyze the prompts for violations of Luma prompt rules
- When you see plan state in the agent chat, note what stage the work is at
- Be specific and direct — quote actual prompts, name actual models, cite actual frame titles
- If you have enough information to give a valuable critique, return "done"
- Don't repeat the same action twice — if a click failed, try something else`;

    const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent?key=${this.geminiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: screenshotB64 } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 600,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini Vision ${response.status}: ${err.slice(0, 150)}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return this.extractJSON(text);
    } catch (e) {
      // On API failure, observe+record the error and continue
      return {
        action: 'observe',
        finding: `Vision API error: ${e.message}`,
        description: 'API error during reasoning step',
      };
    }
  }

  // ── Execute: Playwright DOM action ─────────────────────────────────────

  async execute(page, action) {
    switch (action.action) {
      case 'click': {
        if (!action.target) break;
        // Try three progressively looser strategies
        try {
          await page.getByText(action.target, { exact: true }).first().click({ timeout: 2000 });
          break;
        } catch { /* try next */ }
        try {
          await page.getByText(action.target, { exact: false }).first().click({ timeout: 2000 });
          break;
        } catch { /* try next */ }
        try {
          await page.getByRole('button', { name: action.target }).first().click({ timeout: 2000 });
          break;
        } catch { /* give up */ }
        break;
      }

      case 'rightclick': {
        if (!action.target) break;
        try {
          await page.getByText(action.target, { exact: false }).first().click({ button: 'right', timeout: 2000 });
        } catch { /* skip */ }
        break;
      }

      case 'scroll': {
        const amount = action.direction === 'up' ? -(action.amount || 400) : (action.amount || 400);
        await page.evaluate((y) => window.scrollBy(0, y), amount);
        break;
      }

      case 'hover': {
        if (!action.target) break;
        try {
          await page.getByText(action.target, { exact: false }).first().hover({ timeout: 2000 });
        } catch { /* skip */ }
        break;
      }

      case 'key': {
        if (action.key) await page.keyboard.press(action.key);
        break;
      }

      case 'observe':
      case 'done':
        break; // No DOM interaction
    }
  }

  // ── JSON extraction (same 3-strategy pattern) ───────────────────────────

  extractJSON(raw) {
    if (!raw) return { action: 'observe', finding: 'Empty response', description: 'no output' };

    try { return JSON.parse(raw); } catch { /* try next */ }

    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch { /* try next */ }

    const start = raw.indexOf('{');
    if (start === -1) return { action: 'observe', finding: raw.slice(0, 200), description: 'raw text' };

    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)); } catch { break; }
      }
    }

    return { action: 'observe', finding: 'JSON parse failed', description: raw.slice(0, 200) };
  }
}
