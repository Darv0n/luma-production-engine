/**
 * CREDIT COST ESTIMATOR
 *
 * Calculates estimated Luma Dream Machine credits for a shot list.
 * Based on March 2026 pricing. Includes 15% buffer.
 */

const COSTS = {
  "5s": { draft: 40, "720p SDR": 200, "1080p SDR": 400, "720p HDR": 200, "720p HDR+EXR": 200, "Hi-Fi 4K HDR": 800 },
  "10s": { draft: 80, "720p SDR": 400, "1080p SDR": 800, "720p HDR": 400, "720p HDR+EXR": 400, "Hi-Fi 4K HDR": 1600 },
};

const BUFFER = 1.15; // 15% buffer for iteration

/**
 * Estimate total credits for a shot list.
 *
 * @param {Array} shots - Array of shot objects with duration, quality, draftCount
 * @returns {number} Estimated total credits including buffer
 */
export function estimateCredits(shots) {
  if (!shots?.length) return 0;

  let total = 0;
  shots.forEach((s) => {
    const durCosts = COSTS[s.duration] || COSTS["5s"];
    const draftCost = (s.draftCount || 15) * durCosts.draft;
    const finalCost = 2 * (durCosts[s.quality] || durCosts["1080p SDR"]);
    total += draftCost + finalCost;
  });

  return Math.ceil(total * BUFFER);
}

/**
 * Get per-shot cost breakdown.
 *
 * @param {Object} shot - Single shot object
 * @returns {{ drafts: number, finals: number, total: number }}
 */
export function shotCostBreakdown(shot) {
  const durCosts = COSTS[shot.duration] || COSTS["5s"];
  const drafts = (shot.draftCount || 15) * durCosts.draft;
  const finals = 2 * (durCosts[shot.quality] || durCosts["1080p SDR"]);
  return { drafts, finals, total: drafts + finals };
}
