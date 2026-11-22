const { reliabilityScore, reliabilityInputs, matchScore, distanceKm } = require('../src/modules/matching/service');
const C = require('../src/config');

const stats = (o = {}) => ({
  acceptedJobs: 100, completedJobs: 100, techCancellations: 0, onTimeArrivals: 100,
  ratingSum: 500, ratingCount: 100, repeatCustomers: 100, ...o,
});

test('perfect technician scores 100, weights sum to 1', () => {
  expect(reliabilityScore(stats())).toBe(100);
  const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);
  expect(sum(C.RELIABILITY_WEIGHTS)).toBeCloseTo(1);
  expect(sum(C.MATCH_WEIGHTS)).toBeCloseTo(1);
});

test('fewer than 5 completed jobs → null ("New")', () => {
  expect(reliabilityScore(stats({ completedJobs: 4 }))).toBeNull();
});

test('each input is weighted as in the SRS (30/20/20/15/15)', () => {
  expect(reliabilityScore(stats({ onTimeArrivals: 0 }))).toBe(70); // on-time is 30%
  expect(reliabilityScore(stats({ techCancellations: 50 }))).toBe(90); // half cancelled → lose 10 of 20
  expect(reliabilityInputs(stats({ ratingSum: 400 })).rating).toBe(80); // 4.0 stars → 80
});

test('match score prefers nearer and cheaper when all else is equal', () => {
  const base = { reliability: 80, stats: stats(), years: 5, diagnosticFee: 150, distanceKm: 2 };
  const fees = { min: 100, max: 200 };
  expect(matchScore(base, fees)).toBeGreaterThan(matchScore({ ...base, distanceKm: 20 }, fees));
  expect(matchScore({ ...base, diagnosticFee: 100 }, fees)).toBeGreaterThan(matchScore(base, fees));
});

test('haversine distance Maadi → Tahrir ≈ 9.6 km', () => {
  expect(distanceKm({ lat: 29.9602, lng: 31.2569 }, { lat: 30.0444, lng: 31.2357 })).toBeCloseTo(9.6, 0);
});
