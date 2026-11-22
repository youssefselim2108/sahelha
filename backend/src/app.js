const path = require('path');
const express = require('express');
const { errorHandler } = require('./errors');

const app = express();

// The prototype UI, served from the same origin so it can call /api without CORS.
const UI = path.join(__dirname, '..', '..');
app.get('/', (req, res) => res.sendFile(path.join(UI, 'index.html')));
app.use('/css', express.static(path.join(UI, 'css')));
app.use('/js', express.static(path.join(UI, 'js')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/matches', require('./modules/matching/routes'));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
