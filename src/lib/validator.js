/**
 * LUMA PROMPT VALIDATOR
 *
 * Client-side validation that enforces Luma Dream Machine's prompt rules.
 * Runs on every AI-generated prompt AND on manual edits.
 *
 * This exists because the inner model (generating prompts) cannot be trusted
 * to follow the rules 100% of the time. The validator catches violations
 * and the pipeline's auto-fix pass corrects them.
 */

const DEAD_WORDS = [
  "vibrant",
  "whimsical",
  "hyper-realistic",
  "beautiful",
  "amazing",
  "stunning",
  "cinematic",
  "8k",
  "4k",
  "masterpiece",
  "trending",
  "professional",
  "high quality",
  "detailed",
  "best quality",
];

const NEGATIVE_PATTERNS = [
  /\bno\s+\w+/i,
  /\bwithout\s+/i,
  /\bavoid\s+/i,
  /\bdon'?t\s+include/i,
  /\bexclude\s+/i,
];

const TRANSITION_PATTERNS = [
  /\bbegins?\s+to\b/i,
  /\bstarts?\s+to\b/i,
  /\babout\s+to\b/i,
];

const SHOT_TYPES = [
  "extreme close-up",
  "close-up",
  "medium close-up",
  "medium shot",
  "medium wide",
  "wide shot",
  "extreme wide",
  "over-the-shoulder",
  "pov",
  "low angle",
  "high angle",
  "bird's eye",
  "dutch angle",
  "two-shot",
];

/**
 * Validate a Luma prompt against all known rules.
 *
 * @param {string} text - The prompt to validate
 * @returns {{ wordCount: number, issues: Array<{sev: string, msg: string}>, score: number }}
 */
export function validatePrompt(text) {
  if (!text) return { wordCount: 0, issues: [], score: 0 };

  const words = text.trim().split(/\s+/);
  const lower = text.toLowerCase();
  const issues = [];

  // Word count check
  if (words.length < 20) {
    issues.push({
      sev: "warn",
      msg: `${words.length}w — under 20. Model fills gaps.`,
    });
  } else if (words.length > 50) {
    issues.push({
      sev: "error",
      msg: `${words.length}w — over 50. Later instructions ignored.`,
    });
  } else if (words.length > 40) {
    issues.push({
      sev: "warn",
      msg: `${words.length}w — over 40. Approaching ceiling.`,
    });
  }

  // Dead words
  DEAD_WORDS.forEach((dw) => {
    if (lower.includes(dw)) {
      issues.push({ sev: "error", msg: `Dead word: "${dw}"` });
    }
  });

  // Negative prompting
  NEGATIVE_PATTERNS.forEach((p) => {
    if (p.test(text)) {
      issues.push({
        sev: "error",
        msg: "Negative prompt. Luma is positive-only.",
      });
    }
  });

  // Transition verbs
  TRANSITION_PATTERNS.forEach((p) => {
    if (p.test(text)) {
      issues.push({ sev: "error", msg: "Transition verb. Use mid-action." });
    }
  });

  // Shot type presence
  if (!SHOT_TYPES.some((st) => lower.includes(st))) {
    issues.push({ sev: "warn", msg: "No shot type detected." });
  }

  // Score calculation
  const errors = issues.filter((i) => i.sev === "error").length;
  const warns = issues.filter((i) => i.sev === "warn").length;
  const score = Math.max(0, 100 - errors * 25 - warns * 10);

  return { wordCount: words.length, issues, score };
}

/**
 * Export the dead words list for use in prompt templates
 * (so the inner model knows what to avoid).
 */
export { DEAD_WORDS };
