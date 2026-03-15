/**
 * HARDENED API CLIENT
 *
 * This module exists because the inner Sonnet instances have NO conversation context.
 * They WILL deviate from JSON format. They WILL prepend preamble. They WILL wrap in
 * markdown fences. They WILL use slightly different key names.
 *
 * This was learned from production failures when the app was shared as a project.
 * In-session it worked. Shared, it broke. The fix was defense-in-depth.
 *
 * DO NOT SIMPLIFY THIS MODULE. Every strategy exists because a real failure required it.
 */

const API_URL = "/api/generate";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4000;
const TEMPERATURE = 0.3; // Low temp = less format deviation without killing creativity

/**
 * 3-Strategy JSON Extraction
 *
 * Strategy 1: Direct JSON.parse (works when model behaves)
 * Strategy 2: Strip markdown fences then parse (handles ```json wrapping)
 * Strategy 3: Bracket-match scanner (handles ANY preamble/postamble text)
 */
export function extractJSON(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("extractJSON received non-string input: " + typeof raw);
  }

  // Strategy 1: direct parse
  try {
    return JSON.parse(raw);
  } catch (e) {
    // continue
  }

  // Strategy 2: strip markdown fences
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // continue
  }

  // Strategy 3: bracket-match scanner
  // Find first { or [ and scan to its matching close, handling nested structures
  const objStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");
  let start = -1;
  let openChar = "{";
  let closeChar = "}";

  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    start = objStart;
    openChar = "{";
    closeChar = "}";
  } else if (arrStart >= 0) {
    start = arrStart;
    openChar = "[";
    closeChar = "]";
  }

  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === openChar) depth++;
      if (ch === closeChar) depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1));
        } catch (e) {
          break;
        }
      }
    }
  }

  throw new Error(
    "Could not extract valid JSON from API response. " +
      "First 200 chars: " +
      raw.slice(0, 200)
  );
}

/**
 * Hardened API Call with Retry
 *
 * @param {string} systemPrompt - System prompt for the inner model
 * @param {string} userPrompt - User prompt with task specifics
 * @param {number} retries - Number of retry attempts (default 2)
 * @returns {Object|Array} Parsed JSON response
 */
export async function callAPI(systemPrompt, userPrompt, retries = 2) {
  let lastError = null;

  // Append JSON-only enforcement to every system prompt
  const hardenedSystem =
    systemPrompt +
    "\n\nCRITICAL: Your entire response must be valid JSON. " +
    "No markdown code fences. No explanation text before or after. " +
    "No ```json wrapper. Start with { or [ and end with } or ]. Nothing else.";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          system: hardenedSystem,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      // Handle HTTP errors BEFORE trying to parse JSON
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "unknown");
        throw new Error(
          "API HTTP " + resp.status + ": " + errText.slice(0, 200)
        );
      }

      const data = await resp.json();

      // Check for API-level error objects
      if (data.error) {
        throw new Error(
          "API error: " + (data.error.message || JSON.stringify(data.error))
        );
      }

      // Extract text from content blocks
      const text = (data.content || []).map((c) => c.text || "").join("");

      if (!text.trim()) {
        throw new Error("API returned empty content");
      }

      return extractJSON(text);
    } catch (e) {
      lastError = e;
      console.warn(
        `API attempt ${attempt + 1}/${retries + 1} failed:`,
        e.message
      );

      // Wait before retry with exponential backoff
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error(
    `Pipeline failed after ${retries + 1} attempts: ${lastError?.message || "unknown error"}`
  );
}
