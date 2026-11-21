const mongoose = require('mongoose');
const app = require('./app');
const C = require('./config');
const seed = require('./seed');

(async () => {
  let uri = C.MONGO_URI;
  if (!uri) {
    // No MongoDB configured: start a throwaway in-memory one with demo data.
    // A one-node replica set, because bookings are saved in transactions (NFR-AVL-03).
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    uri = (await MongoMemoryReplSet.create({ replSet: { count: 1 } })).getUri();
    console.log('MONGO_URI not set: using an in-memory MongoDB (data is lost on exit)');
  }
  await mongoose.connect(uri);
  if (!(await mongoose.model('User').exists({}))) await seed();
  app.listen(C.PORT, () => console.log(`Sahelha API on http://localhost:${C.PORT}/api`));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
