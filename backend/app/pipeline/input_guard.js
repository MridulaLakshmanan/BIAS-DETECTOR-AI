'use strict';
/**
 * Phase 1 — Input Guard
 * Calls the Python bias-detector microservice to analyze input for bias signals.
 */
const config = require('../config');

async function analyzeInput(text) {
  const res = await fetch(`${config.biasDetectorUrl}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, context: 'general' }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bias detector returned ${res.status}: ${body}`);
  }

  return res.json();
  // Returns: { input_bias_score, protected_attributes, proxy_variables, decision_points }
}

module.exports = { analyzeInput };
