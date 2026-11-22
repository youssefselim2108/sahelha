const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const seed = require('../src/seed');
const { Technician } = require('../src/models');

let mongo;
const { lat, lng } = seed.MAADI;
const matches = (q) => request(app).get('/api/matches').query({ lat, lng, ...q });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await seed();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('FR-MAT-01/02: only the right trade, best match first', async () => {
  const { candidates } = (await matches({ category: 'ac' }).expect(200)).body;
  expect(candidates.map((c) => c.name).sort()).toEqual(['Ahmed Salah', 'Karim Adel', 'Mostafa Hassan', 'Youssef Nabil']);
  const scores = candidates.map((c) => c.matchScore);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  expect(candidates.find((c) => c.name === 'Youssef Nabil').reliability).toBeNull(); // 3 jobs → "New"
});

test('FR-MAT-05: sort by nearest or cheapest', async () => {
  const near = (await matches({ category: 'ac', sort: 'nearest' })).body.candidates.map((c) => c.distanceKm);
  expect(near).toEqual([...near].sort((a, b) => a - b));
  const fees = (await matches({ category: 'ac', sort: 'cheapest' })).body.candidates.map((c) => c.diagnosticFee);
  expect(fees).toEqual([...fees].sort((a, b) => a - b));
});

test('FR-VER-05 / FR-MAT-07: unverified technicians are hidden; empty list says so', async () => {
  await Technician.updateOne({ name: 'Hany Fawzy' }, { verified: false });
  const r = (await matches({ category: 'plumbing' }).expect(200)).body;
  expect(r.candidates).toEqual([]);
  expect(r.message).toMatch(/No technician/);
});

test('bad input is rejected', async () => {
  await matches({ category: 'cleaning' }).expect(400);
  await request(app).get('/api/matches').query({ category: 'ac' }).expect(400);
});
