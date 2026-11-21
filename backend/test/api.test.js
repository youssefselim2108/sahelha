process.env.CLASSIFIER_URL = 'http://127.0.0.1:9/classify'; // nothing listens here: tests the fallback path
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../src/app');
const seed = require('../src/seed');
const { Technician, StatusEvent, Settings, Booking } = require('../src/models');

let mongo;
const api = () => request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (login) => (await api().post('/api/auth/login').send({ login, password: seed.PASSWORD })).body.token;
const tomorrow = () => new Date(Date.now() + 24 * 3600e3).toISOString();

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); // transactions need a replica set
  await mongoose.connect(mongo.getUri());
  await seed();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('auth (FR-AUTH)', () => {
  test('register, reject duplicate phone, never return the hash', async () => {
    const body = { name: 'Mona Adel', phone: '01009998887', password: 'password1' };
    const r = await api().post('/api/auth/register/customer').send(body).expect(201);
    expect(r.body.token).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|password1/);
    await api().post('/api/auth/register/customer').send(body).expect(409);
  });

  test('wrong password → 401, short password → 400, no admin self-registration', async () => {
    await api().post('/api/auth/login').send({ login: '01001234567', password: 'nope-nope' }).expect(401);
    await api().post('/api/auth/register/customer').send({ name: 'X', phone: '01009998886', password: '123' }).expect(400);
    await api().post('/api/auth/register/admin').send({}).expect(404);
  });

  test('new technician is Pending and is never matched until verified (BR-08)', async () => {
    const r = await api().post('/api/auth/register/technician').send({
      name: 'New Tech', phone: '01111111119', password: 'password1', trades: ['plumbing'], years: 3,
      base: { lat: 29.96, lng: 31.257 }, diagnosticFee: 50,
    }).expect(201);
    expect(r.body.technician.status).toBe('Pending');
    const cust = await login('01001234567');
    const req = await api().post('/api/requests').set(auth(cust)).send({
      description: 'Kitchen sink is leaking', category: 'plumbing', location: { lat: 29.96, lng: 31.257 }, slotStart: tomorrow(),
    }).expect(201);
    const m = await api().get(`/api/requests/${req.body._id}/matches`).set(auth(cust)).expect(200);
    expect(m.body.candidates.map((c) => c.name)).not.toContain('New Tech');
  });

  test('/me gives a technician their own profile and score, and serves the UI page', async () => {
    const tech = await login('01112345678');
    const me = await api().get('/api/auth/me').set(auth(tech)).expect(200);
    expect(me.body.technician).toMatchObject({ name: 'Ahmed Salah', status: 'Verified' });
    expect(me.body.technician.reliability).toBeGreaterThan(0);
    await api().get('/').expect(200).expect(/Sahelha/);
    await api().get('/backend/src/config.js').expect(404); // source is not exposed
  });

  test('role guard: technician cannot use admin routes', async () => {
    const tech = await login('01112345678');
    await api().get('/api/admin/technicians').set(auth(tech)).expect(403);
    await api().get('/api/admin/technicians').expect(401);
  });
});

describe('full job flow (scenario S1)', () => {
  test('request → match → book → accept → quote → extra → complete', async () => {
    const cust = await login('01001234567');
    const tech = await login('01112345678'); // Ahmed Salah, AC

    // AI suggestion endpoint never blocks: classifier is not running in tests (FR-AI-03)
    const sug = await api().post('/api/requests/suggest').set(auth(cust)).send({ description: 'التكييف مش بيبرد' }).expect(200);
    expect(sug.body.category).toBeNull();

    const rq = await api().post('/api/requests').set(auth(cust)).send({
      description: 'AC is running but not cooling', category: 'ac', suggestedCategory: 'ac',
      location: { lat: 29.9602, lng: 31.2569, address: 'Maadi' }, slotStart: tomorrow(),
    }).expect(201);

    const m = await api().get(`/api/requests/${rq.body._id}/matches`).set(auth(cust)).expect(200);
    const names = m.body.candidates.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Ahmed Salah', 'Karim Adel', 'Mostafa Hassan', 'Youssef Nabil']));
    expect(names).not.toContain('Hany Fawzy'); // plumber
    const scores = m.body.candidates.map((c) => c.matchScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(m.body.candidates.find((c) => c.name === 'Youssef Nabil').reliability).toBeNull(); // "New"

    const ahmed = m.body.candidates.find((c) => c.name === 'Ahmed Salah');
    const bk = await api().post('/api/bookings').set(auth(cust)).send({ requestId: rq.body._id, technicianId: ahmed.id }).expect(201);
    const id = bk.body._id;
    expect(bk.body.status).toBe('Confirmed');

    // BR-07: same technician, overlapping slot
    const rq2 = await api().post('/api/requests').set(auth(cust)).send({
      description: 'Second AC is noisy', category: 'ac', location: { lat: 29.9602, lng: 31.2569 }, slotStart: rq.body.slotStart,
    }).expect(201);
    await api().post('/api/bookings').set(auth(cust)).send({ requestId: rq2.body._id, technicianId: ahmed.id }).expect(409);
    const m2 = await api().get(`/api/requests/${rq2.body._id}/matches`).set(auth(cust)).expect(200);
    expect(m2.body.candidates.map((c) => c.name)).not.toContain('Ahmed Salah');

    const before = await Technician.findById(ahmed.id).lean();
    // Customer cannot move the status; illegal jump rejected (BR-01)
    await api().post(`/api/bookings/${id}/status`).set(auth(cust)).send({ to: 'OnTheWay' }).expect(403);
    await api().post(`/api/bookings/${id}/accept`).set(auth(tech)).expect(200);
    await api().post(`/api/bookings/${id}/status`).set(auth(tech)).send({ to: 'Completed' }).expect(409);
    await api().post(`/api/bookings/${id}/status`).set(auth(tech)).send({ to: 'OnTheWay' }).expect(200);
    await api().post(`/api/bookings/${id}/status`).set(auth(tech)).send({ to: 'Arrived' }).expect(200);

    // BR-02: no ServiceStarted without approved quote
    await api().post(`/api/bookings/${id}/status`).set(auth(tech)).send({ to: 'ServiceStarted' }).expect(409);
    await api().post(`/api/bookings/${id}/quotation`).set(auth(tech)).send({ items: [{ kind: 'parts', description: 'Gas', amount: -5 }] }).expect(400);
    await api().post(`/api/bookings/${id}/quotation`).set(auth(tech)).send({
      items: [
        { kind: 'diagnostic', description: 'Inspection', amount: 150 },
        { kind: 'parts', description: 'Drain pan', amount: 180 },
        { kind: 'labor', description: 'Repair', amount: 200 },
      ],
    }).expect(201);
    const q = await api().post(`/api/bookings/${id}/quotation/decision`).set(auth(cust)).send({ approve: true }).expect(200);
    expect(q.body.approvedTotal).toBe(530);

    await api().post(`/api/bookings/${id}/status`).set(auth(tech)).send({ to: 'ServiceStarted' }).expect(200);
    await api().post(`/api/bookings/${id}/cancel`).set(auth(cust)).send({ reason: 'changed mind' }).expect(409); // BR-05

    // BR-03: extra cost counts only once approved
    const ex = await api().post(`/api/bookings/${id}/quotation/extra`).set(auth(tech)).send({ description: 'Capacitor', amount: 120 }).expect(201);
    expect(ex.body.approvedTotal).toBe(530);
    expect(ex.body.pendingTotal).toBe(120);
    const itemId = ex.body.items.at(-1)._id;
    const ok = await api().post(`/api/bookings/${id}/quotation/extra/${itemId}/decision`).set(auth(cust)).send({ approve: true }).expect(200);
    expect(ok.body.approvedTotal).toBe(650);
    await api().post(`/api/bookings/${id}/quotation/extra/${itemId}/decision`).set(auth(cust)).send({ approve: false }).expect(409); // BR-04

    await api().post(`/api/bookings/${id}/status`).set(auth(tech)).send({ to: 'Completed' }).expect(200);
    const after = await Technician.findById(ahmed.id).lean();
    expect(after.stats.completedJobs).toBe(before.stats.completedJobs + 1);
    expect(after.stats.onTimeArrivals).toBe(before.stats.onTimeArrivals + 1); // arrived before slot start

    const events = await StatusEvent.find({ booking: id }).sort({ at: 1 }).lean();
    expect(events.map((e) => e.to)).toEqual(['Confirmed', 'Assigned', 'OnTheWay', 'Arrived', 'ServiceStarted', 'Completed']);
  });

  test('declining a quote cancels the booking; tech cancelling after accept counts (BR-06)', async () => {
    const cust = await login('01001234567');
    const tech = await login('01112345683'); // Sameh, electrical
    const rq = await api().post('/api/requests').set(auth(cust)).send({
      description: 'Lights keep tripping the breaker', category: 'electrical', location: { lat: 29.9602, lng: 31.2569 }, slotStart: tomorrow(),
    }).expect(201);
    const [sameh] = (await api().get(`/api/requests/${rq.body._id}/matches`).set(auth(cust))).body.candidates;
    const book = async () => (await api().post('/api/bookings').set(auth(cust)).send({ requestId: rq.body._id, technicianId: sameh.id }).expect(201)).body._id;

    const id = await book();
    await api().post(`/api/bookings/${id}/accept`).set(auth(tech)).expect(200);
    for (const to of ['OnTheWay', 'Arrived']) await api().post(`/api/bookings/${id}/status`).set(auth(tech)).send({ to }).expect(200);
    await api().post(`/api/bookings/${id}/quotation`).set(auth(tech)).send({ items: [{ kind: 'diagnostic', description: 'Check', amount: 120 }] }).expect(201);
    await api().post(`/api/bookings/${id}/quotation/decision`).set(auth(cust)).send({ approve: false }).expect(200);
    expect((await api().get(`/api/bookings/${id}`).set(auth(cust))).body.status).toBe('Cancelled');

    const before = (await Technician.findById(sameh.id).lean()).stats.techCancellations;
    const id2 = await book();
    await api().post(`/api/bookings/${id2}/accept`).set(auth(tech)).expect(200);
    await api().post(`/api/bookings/${id2}/cancel`).set(auth(tech)).send({}).expect(400); // reason required
    await api().post(`/api/bookings/${id2}/cancel`).set(auth(tech)).send({ reason: 'Van broke down' }).expect(200);
    expect((await Technician.findById(sameh.id).lean()).stats.techCancellations).toBe(before + 1);
  });
});

describe('SRS rules found in the requirements check', () => {
  const newRequest = (cust, body) => api().post('/api/requests').set(auth(cust)).send({
    description: 'Kitchen sink is leaking badly', category: 'plumbing', location: { lat: 29.9602, lng: 31.2569 }, slotStart: tomorrow(), ...body,
  });

  test('FR-REQ-01/03/05: six categories, 10+ characters, slot within 14 days', async () => {
    const cust = await login('01001234567');
    await newRequest(cust, { category: 'cleaning' }).expect(400);
    await newRequest(cust, { description: 'Leak!!' }).expect(400);
    await newRequest(cust, { slotStart: new Date(Date.now() + 15 * 86400e3).toISOString() }).expect(400);
    await newRequest(cust, {}).expect(201);
  });

  test('NFR-SEC-05: login rejects query operators', async () => {
    await api().post('/api/auth/login').send({ login: { $ne: null }, password: 'sahelha123' }).expect(400);
  });

  test('FR-BOK-04: an unanswered booking lapses, is cancelled and frees the technician', async () => {
    const cust = await login('01001234567');
    const rq = await newRequest(cust, {}).expect(201);
    const [hany] = (await api().get(`/api/requests/${rq.body._id}/matches`).set(auth(cust))).body.candidates;
    const bk = await api().post('/api/bookings').set(auth(cust)).send({ requestId: rq.body._id, technicianId: hany.id }).expect(201);
    const rq2 = await newRequest(cust, { slotStart: rq.body.slotStart }).expect(201);
    const busy = (await api().get(`/api/requests/${rq2.body._id}/matches`).set(auth(cust))).body.candidates;
    expect(busy.map((c) => c.name)).not.toContain('Hany Fawzy');

    await Booking.updateOne({ _id: bk.body._id }, { acceptBy: new Date(Date.now() - 1000) }); // window passes
    const free = (await api().get(`/api/requests/${rq2.body._id}/matches`).set(auth(cust))).body.candidates;
    expect(free.map((c) => c.name)).toContain('Hany Fawzy');
    const b = (await api().get(`/api/bookings/${bk.body._id}`).set(auth(cust))).body;
    expect(b).toMatchObject({ status: 'Cancelled', cancelReason: 'No response in time', cancelledBy: 'system' });
    expect(b.events.map((e) => e.to)).toEqual(['Confirmed', 'Cancelled']);
  });

  test('NFR-AVL-03: if the status event cannot be saved, no booking is left behind', async () => {
    const cust = await login('01001234567');
    const rq = await newRequest(cust, {}).expect(201);
    const [tech] = (await api().get(`/api/requests/${rq.body._id}/matches`).set(auth(cust))).body.candidates;
    const before = await Booking.countDocuments();
    const spy = jest.spyOn(StatusEvent, 'create').mockRejectedValueOnce(new Error('disk full'));
    await api().post('/api/bookings').set(auth(cust)).send({ requestId: rq.body._id, technicianId: tech.id }).expect(500);
    spy.mockRestore();
    expect(await Booking.countDocuments()).toBe(before);
  });

  test('FR-VER-03/04: non-approval needs a reason; every decision is recorded', async () => {
    const admin = await login('01000000000');
    const sameh = await Technician.findOne({ trades: 'electrical' });
    const url = `/api/admin/technicians/${sameh._id}/verify`;
    await api().post(url).set(auth(admin)).send({ decision: 'NeedsInfo' }).expect(400);
    await api().post(url).set(auth(admin)).send({ decision: 'NeedsInfo', reason: 'ID photo is blurry' }).expect(200);
    await api().post(url).set(auth(admin)).send({ decision: 'Verified' }).expect(200);
    const log = (await api().get(`/api/admin/technicians/${sameh._id}/decisions`).set(auth(admin)).expect(200)).body;
    expect(log.map((d) => d.decision)).toEqual(['Verified', 'NeedsInfo']);
    expect(log[1]).toMatchObject({ reason: 'ID photo is blurry', admin: { name: 'Sahelha Admin' } });
  });
});

describe('admin', () => {
  test('weights must sum to 1 and changes are logged (FR-REL-02)', async () => {
    const admin = await login('01000000000');
    await api().put('/api/admin/settings/weights').set(auth(admin))
      .send({ reliabilityWeights: { onTime: 0.5, fewCancellations: 0.5, rating: 0.5, completedJobs: 0, repeatCustomers: 0 } }).expect(400);
    await api().put('/api/admin/settings/weights').set(auth(admin))
      .send({ matchWeights: { reliability: 0.4, rating: 0.2, distance: 0.2, price: 0.1, experience: 0.1 } }).expect(200);
    const s = await Settings.findById('global').lean();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].field).toBe('matchWeights');
  });

  test('admin verifies a pending technician', async () => {
    const admin = await login('01000000000');
    const q = await api().get('/api/admin/technicians?status=Pending').set(auth(admin)).expect(200);
    const t = q.body.find((x) => x.user.name === 'New Tech');
    const r = await api().post(`/api/admin/technicians/${t._id}/verify`).set(auth(admin)).send({ decision: 'Verified' }).expect(200);
    expect(r.body.status).toBe('Verified');
  });
});
