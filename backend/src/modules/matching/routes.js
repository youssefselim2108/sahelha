const router = require('express').Router();
const { HttpError, wrap } = require('../../errors');
const { findCandidates } = require('./service');
const { CATEGORIES } = require('../../config');

// GET /api/matches?category=ac&lat=29.96&lng=31.25&sort=best|nearest|cheapest|rating
router.get('/', wrap(async (req, res) => {
  const category = String(req.query.category || '');
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!CATEGORIES.includes(category)) throw new HttpError(400, `category must be one of ${CATEGORIES.join(', ')}`);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'lat and lng are required numbers');

  const candidates = await findCandidates(category, { lat, lng }, String(req.query.sort || 'best'));
  // FR-MAT-07: tell the customer when nobody is found
  res.json({ candidates, message: candidates.length ? undefined : 'No technician found. Try another time or area.' });
}));

module.exports = router;
