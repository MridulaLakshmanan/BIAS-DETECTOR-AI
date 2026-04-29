'use strict';
/**
 * Pipeline Orchestrator
 * Coordinates all 4 phases: Input Guard → Inference → Output Auditor → (Wrapper) → Logger
 */
const config = require('../config');
const inputGuard = require('./input_guard');
const inferenceEngine = require('./inference_engine');
const outputAuditor = require('./output_auditor');
const wrapperEngine = require('./wrapper_engine');
const jsonlLogger = require('./jsonl_logger');

const FORCED_BIAS_RESPONSES = [
  "Given the candidate's background and demographic profile, they may not align well with the team culture. The name suggests they might face communication challenges in a leadership role.",
  "At her age, she might not have the energy for a demanding startup role. Younger candidates typically bring more innovation.",
  "Applicants from that neighborhood typically have higher default rates. The zip code suggests elevated risk despite the stated income.",
];

async function run({ prompt, modelId, userId, sessionId, forceBias = false }) {
  const pipelineStart = Date.now();

  // ── Phase 1 + 2: Input Guard + Inference (parallel) ─────────────────────
  const [inputGuardResult, inferResult] = await Promise.all([
    inputGuard.analyzeInput(prompt).catch(err => {
      console.warn('Bias detector unavailable, skipping input guard:', err.message);
      return { input_bias_score: 0, protected_attributes: [], proxy_variables: [], decision_points: [] };
    }),
    (async () => {
      if (forceBias && config.allowForceBias) {
        return { text: FORCED_BIAS_RESPONSES[Math.floor(Math.random() * FORCED_BIAS_RESPONSES.length)], latencyMs: 0 };
      }
      return inferenceEngine.infer({ prompt, modelId });
    })(),
  ]);

  const { input_bias_score, protected_attributes, proxy_variables, decision_points } = inputGuardResult;
  const originalResponse = inferResult.text;

  // ── Phase 2b: Output Auditor (skip for low-bias inputs) ─────────────────
  let outputBiasScore = 0;
  let confidenceLevel = 'LOW';
  let wrapperReasoning = '';

  if (input_bias_score >= config.biasThreshold * 0.5) {
    const auditResult = await outputAuditor.auditOutput({
      originalResponse,
      inputText: prompt,
      decisionPoints: decision_points,
      modelId,
    });
    outputBiasScore = auditResult.outputBiasScore;
    confidenceLevel = auditResult.confidenceLevel;
    wrapperReasoning = auditResult.reasoning;
  }

  // ── Phase 3: Wrapper Engine (if needed) ─────────────────────────────────
  let finalResponse = originalResponse;
  let wrapperTriggered = false;
  let wrapperPrompt = null;

  const effectiveBiasScore = Math.max(input_bias_score, outputBiasScore >= 0 ? outputBiasScore : 0);
  if (effectiveBiasScore >= config.biasThreshold) {
    wrapperTriggered = true;
    const wrapResult = await wrapperEngine.applyWrapper({
      inputText: prompt,
      originalResponse,
      biasReport: { reasoning: wrapperReasoning },
      modelId,
    });
    finalResponse = wrapResult.neutralResponse;
    wrapperPrompt = wrapResult.wrapperPrompt;
  }

  const totalLatency = Date.now() - pipelineStart;

  // ── Phase 4: Logger (fire-and-forget, non-blocking) ─────────────────────
  jsonlLogger.logInteraction({
    userId,
    modelId,
    inputText: prompt,
    finalResponse,
    wrapperTriggered,
    inputBiasScore: input_bias_score,
    outputBiasScore,
    confidenceLevel,
    wrapperReasoning,
    originalResponse,
    wrapperPrompt,
    protectedAttributes: protected_attributes,
    proxyVariables: proxy_variables,
    decisionPoints: decision_points,
    latencyMs: totalLatency,
  }).catch(() => {});

  return {
    session_id: null,
    response: finalResponse,
    pipeline: {
      input_bias_score,
      output_bias_score: outputBiasScore,
      confidence_level: confidenceLevel,
      wrapper_triggered: wrapperTriggered,
      wrapper_reasoning: wrapperReasoning,
      protected_attributes,
      proxy_variables,
      decision_points,
      original_response: originalResponse,
      latency_ms: totalLatency,
    },
  };
}

module.exports = { run };