'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const config = require('./config');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/health', require('./api/routes_health'));
app.use('/api/auth', require('./api/routes_auth'));
app.use('/api/chat', require('./api/routes_chat'));
app.use('/api/bias', require('./api/routes_bias'));
app.use('/api/dashboard', require('./api/routes_dashboard'));
app.use('/api/logs', require('./api/routes_logs'));
app.use('/api/retrain', require('./api/routes_retrain'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found`, code: 'NOT_FOUND' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`✓ Backend running on http://localhost:${config.port}`);
  console.log(`✓ Environment: ${config.nodeEnv}`);
  console.log(`✓ Bias detector: ${config.biasDetectorUrl}`);
});

module.exports = app;
