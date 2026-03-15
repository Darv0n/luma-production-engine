/**
 * FIX STAGE PROMPTS
 *
 * Auto-corrects prompts that failed validation (score < 50).
 * Preserves creative intent while fixing rule violations.
 */

export const FIX_SYSTEM = `You fix Luma Dream Machine prompts that violate production rules.

Same rules apply:
- 20-40 words
- Mid-action verbs only (not "begins to" / "starts to" / "about to")
- Positive prompting only (describe what IS present, never "no X" / "without X")
- No dead words: vibrant, whimsical, hyper-realistic, beautiful, amazing, stunning, cinematic, 8K, 4K, masterpiece, trending, professional, high quality, detailed, best quality
- Structure: "[Shot type], [subject + mid-action verb], [secondary motion], [camera motion], [lighting], [mood]. [Equipment prime]."

Preserve creative intent. Fix only what's broken.

Return ONLY valid JSON array.`;

export function buildFixUser(failing, shots) {
  return `Fix these failing prompts while preserving creative intent.

${failing
  .map(
    (f) => `Shot ${f.shotIndex + 1} "${shots[f.shotIndex].name}":
  Current: "${shots[f.shotIndex].prompt}"
  Issues: ${f.issues.map((x) => x.msg).join("; ")}`
  )
  .join("\n\n")}

Return JSON array:
[{ "shotIndex": 0, "fixedPrompt": "the corrected prompt" }]`;
}

/**
 * Apply fixes to shots array.
 */
export function applyFixes(shots, fixes) {
  const fixArray = Array.isArray(fixes)
    ? fixes
    : fixes?.fixes || [];

  return shots.map((s, i) => {
    const fix = fixArray.find((f) => f.shotIndex === i);
    return fix ? { ...s, prompt: fix.fixedPrompt } : s;
  });
}
