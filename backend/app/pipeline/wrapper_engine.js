'use strict';
/**
 * Phase 3 — Wrapper Engine
 * Generates a neutralizing meta-prompt and re-runs inference.
 */
const { infer } = require('./inference_engine');

const WRAPPER_SYSTEM = `You are a bias mitigation specialist. Your task is to rewrite the given AI response to remove any bias related to protected attributes while preserving the core informational content and intent.

The rewritten response must:
- Not reference or infer protected characteristics (race, gender, age, religion, etc.)
- Be factual, objective, and professional
- Maintain the same helpful intent as the original

Return ONLY the rewritten response text. No explanations, no preamble.`;

async function applyWrapper({ inputText, originalResponse, biasReport, modelId }) {
  const wrapperPrompt = `ORIGINAL INPUT:\n${inputText}\n\nBIASED RESPONSE TO NEUTRALIZE:\n${originalResponse}\n\nBIAS SIGNALS DETECTED:\n${biasReport.reasoning || 'High bias score detected'}`;

  const { text: neutralResponse } = await infer({
    prompt: wrapperPrompt,
    modelId,
    systemPrompt: WRAPPER_SYSTEM,
  });

  return {
    neutralResponse,
    wrapperPrompt,
  };
}

module.exports = { applyWrapper };
