module.exports = {
  PORT: Number(process.env.PORT) || 4000,
  MONGO_URI: process.env.MONGO_URI, // unset → an in-memory MongoDB is started (demo only)
  CATEGORIES: ['plumbing', 'electrical', 'ac', 'carpentry', 'painting', 'appliances'], // FR-REQ-01
  MAX_RADIUS_KM: 30, // FR-LOC-03
  MAX_CANDIDATES: 10, // FR-MAT-06
  MIN_JOBS_FOR_SCORE: 5, // FR-REL-06: fewer jobs → shown as "New"
  RELIABILITY_WEIGHTS: { onTime: 0.3, fewCancellations: 0.2, rating: 0.2, completedJobs: 0.15, repeatCustomers: 0.15 }, // FR-REL-02
  MATCH_WEIGHTS: { reliability: 0.3, rating: 0.2, distance: 0.2, price: 0.15, experience: 0.15 }, // FR-MAT-03
};
