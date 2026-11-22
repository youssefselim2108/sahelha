const { Schema, model } = require('mongoose');
const { CATEGORIES } = require('../config');

// One collection for this milestone: the technicians that matching ranks.
const Technician = model('Technician', new Schema({
  name: { type: String, required: true, trim: true },
  trades: { type: [{ type: String, enum: CATEGORIES }], validate: (v) => v.length > 0 },
  years: { type: Number, min: 0, default: 0 },
  base: { lat: { type: Number, required: true }, lng: { type: Number, required: true } }, // service area centre
  radiusKm: { type: Number, min: 1, max: 30, default: 10 }, // FR-LOC-03
  diagnosticFee: { type: Number, min: 0, default: 150 }, // EGP
  verified: { type: Boolean, default: false }, // FR-VER-05: only verified technicians are matched
  online: { type: Boolean, default: true },
  // The five reliability inputs are counted from these (FR-REL-01)
  stats: {
    acceptedJobs: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    techCancellations: { type: Number, default: 0 },
    onTimeArrivals: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    repeatCustomers: { type: Number, default: 0 },
  },
}, { timestamps: true }));

module.exports = { Technician };
