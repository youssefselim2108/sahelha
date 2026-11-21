const path = require('path');
const express = require('express');
const { errorHandler } = require('./errors');

const app = express();
app.use(express.json({ limit: '100kb' }));

// The prototype UI, served from the same origin so it can call /api without CORS.
// Only these paths are exposed; the backend source next to them is not.
const UI = path.join(__dirname, '..', '..');
app.get('/', (req, res) => res.sendFile(path.join(UI, 'index.html')));
app.use('/css', express.static(path.join(UI, 'css')));
app.use('/js', express.static(path.join(UI, 'js')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./auth/routes').router);
app.use('/api/requests', require('./modules/requests/routes'));
app.use('/api/bookings/:id/quotation', require('./modules/quotations/routes'));
app.use('/api/bookings', require('./modules/bookings/routes').router);
app.use('/api/admin', require('./modules/admin/routes'));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
