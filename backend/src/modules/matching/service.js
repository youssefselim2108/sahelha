// Reliability score (FR-REL) and match score (FR-MAT).
const { Technician } = require('../../models');
const C = require('../../config');

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// FR-REL-01: five inputs, each turned into 0–100
function reliabilityInputs(s) {
  const done = s.completedJobs;
  return {
    onTime: done ? (100 * s.onTimeArrivals) / done : 100,
    fewCancellations: s.acceptedJobs ? 100 * (1 - s.techCancellations / s.acceptedJobs) : 100,
    rating: s.ratingCount ? (100 * s.ratingSum) / s.ratingCount / 5 : 0,
    completedJobs: 100 * clamp01(done / 50), // 50+ jobs = full marks
    repeatCustomers: done ? (100 * s.repeatCustomers) / done : 0,
  };
}

// R = Σ wᵢ·sᵢ. Fewer than 5 completed jobs → null, shown as "New" (FR-REL-06)
function reliabilityScore(stats) {
  if (stats.completedJobs < C.MIN_JOBS_FOR_SCORE) return null;
  const inputs = reliabilityInputs(stats);
  const w = C.RELIABILITY_WEIGHTS;
  return Math.round(Object.keys(w).reduce((sum, k) => sum + w[k] * inputs[k], 0));
}

// Straight-line distance in km (haversine)
function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// FR-MAT-02: weighted match score, 0–100. `fees` is the cheapest and dearest fee in this list.
function matchScore(t, fees) {
  const w = C.MATCH_WEIGHTS;
  const rel = (t.reliability ?? 70) / 100; // "New" technicians get an average-ish value
  const rating = t.stats.ratingCount ? t.stats.ratingSum / t.stats.ratingCount / 5 : 0.8;
  const distance = 1 - clamp01(t.distanceKm / C.MAX_RADIUS_KM);
  const price = fees.max === fees.min ? 1 : 1 - (t.diagnosticFee - fees.min) / (fees.max - fees.min);
  const experience = clamp01(t.years / 15);
  return Math.round(100 * (w.reliability * rel + w.rating * rating + w.distance * distance + w.price * price + w.experience * experience));
}

const SORTS = {
  best: (a, b) => b.matchScore - a.matchScore,
  nearest: (a, b) => a.distanceKm - b.distanceKm,
  cheapest: (a, b) => a.diagnosticFee - b.diagnosticFee,
  rating: (a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0),
};

// FR-MAT-01: verified, online, right trade and covering the location; best match first, at most 10
async function findCandidates(category, location, sort = 'best') {
  const pool = await Technician.find({ verified: true, online: true, trades: category }).lean();
  const near = pool
    .map((t) => ({ ...t, distanceKm: distanceKm(location, t.base), reliability: reliabilityScore(t.stats) }))
    .filter((t) => t.distanceKm <= t.radiusKm);
  const fees = { min: Math.min(...near.map((t) => t.diagnosticFee)), max: Math.max(...near.map((t) => t.diagnosticFee)) };

  return near
    .map((t) => ({
      id: t._id,
      name: t.name,
      trades: t.trades,
      years: t.years,
      diagnosticFee: t.diagnosticFee,
      completedJobs: t.stats.completedJobs,
      avgRating: t.stats.ratingCount ? Math.round((t.stats.ratingSum / t.stats.ratingCount) * 10) / 10 : null,
      reliability: t.reliability, // null → "New"
      reliabilityInputs: reliabilityInputs(t.stats),
      distanceKm: Math.round(t.distanceKm * 10) / 10,
      matchScore: matchScore(t, fees),
    }))
    .sort(SORTS[sort] || SORTS.best)
    .slice(0, C.MAX_CANDIDATES);
}

module.exports = { reliabilityInputs, reliabilityScore, distanceKm, matchScore, findCandidates };
