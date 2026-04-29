'use strict';
/**
 * Phase 2 — Inference Engine
 * Routes the prompt to the selected LLM provider.
 */
const { getProvider } = require('../providers/registry');

async function infer({ prompt, modelId, systemPrompt = null }) {
  const provider = getProvider(modelId);
  const start = Date.now();
  const text = await provider.infer(modelId, systemPrompt, prompt);
  return { text, latencyMs: Date.now() - start };
}

module.exports = { infer };
