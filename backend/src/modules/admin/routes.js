const router = require('express').Router();
const mongoose = require('mongoose');
const { Technician, Settings, VerificationRecord } = require('../../models');
const { requireAuth, requireRole } = require('../../auth/middleware');
const { HttpError, wrap } = require('../../errors');
const { getSettings, recomputeReliability } = require('../matching/service');

router.use(requireAuth, requireRole('admin'));

// FR-VER: verification queue
router.get('/technicians', wrap(async (req, res) => {
  const filter = req.query.status ? { status: String(req.query.status) } : {}; // String(): no query operators (NFR-SEC-05)
  res.json(await Technician.find(filter).populate('user', 'name phone email').sort({ createdAt: 1 }));
}));

// FR-VER-03/04: approve, reject, ask for more information or suspend. Anything but approval needs a written reason,
// and the decision is stored together with the status change.
router.post('/technicians/:id/verify', wrap(async (req, res) => {
  const decision = String(req.body.decision || '');
  const reason = String(req.body.reason || '').trim();
  const allowed = ['Verified', 'Rejected', 'NeedsInfo', 'Suspended'];
  if (!allowed.includes(decision)) throw new HttpError(400, `decision must be one of ${allowed.join(', ')}`);
  if (decision !== 'Verified' && !reason) throw new HttpError(400, 'A written reason is required for this decision');
  let t;
  await mongoose.connection.transaction(async (session) => {
    t = await Technician.findByIdAndUpdate(req.params.id, { status: decision }, { new: true, session });
    if (!t) throw new HttpError(404, 'Technician not found');
    await VerificationRecord.create([{ technician: t._id, admin: req.user.id, decision, reason: reason || undefined }], { session });
  });
  res.json(t);
}));

router.get('/technicians/:id/decisions', wrap(async (req, res) => {
  res.json(await VerificationRecord.find({ technician: req.params.id }).sort({ decidedAt: -1 }).populate('admin', 'name'));
}));

router.get('/settings/weights', wrap(async (req, res) => res.json(await getSettings())));

// FR-REL-02 / FR-MAT-03: weights must sum to 1; every change is logged
router.put('/settings/weights', wrap(async (req, res) => {
  const current = await getSettings();
  const update = {};
  const history = [];
  for (const field of ['reliabilityWeights', 'matchWeights']) {
    const next = req.body[field];
    if (!next) continue;
    const keys = Object.keys(current[field]);
    if (Object.keys(next).sort().join() !== keys.sort().join()) throw new HttpError(400, `${field} must have keys: ${keys.join(', ')}`);
    const values = Object.values(next);
    if (values.some((v) => typeof v !== 'number' || v < 0)) throw new HttpError(400, `${field} must be non-negative numbers`);
    if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-6) throw new HttpError(400, `${field} must add up to 1`);
    update[field] = next;
    history.push({ field, from: current[field], to: next, by: req.user.id });
  }
  if (!history.length) throw new HttpError(400, 'Nothing to update');
  await Settings.findByIdAndUpdate('global', { $set: update, $push: { history: { $each: history } } }, { upsert: true });
  if (update.reliabilityWeights) {
    for (const t of await Technician.find({}, '_id')) await recomputeReliability(t._id);
  }
  res.json(await getSettings());
}));

module.exports = router;
