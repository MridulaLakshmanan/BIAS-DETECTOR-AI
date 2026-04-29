'use strict';
/**
 * Phase 4 — JSONL Logger
 * Persists pipeline results to Supabase + local JSONL audit file.
 */
const fs = require('fs').promises;
const path = require('path');
const supabase = require('../db/supabase_client');

const JSONL_PATH = path.resolve(__dirname, '../../data/logs/bias_interactions.jsonl');

async function logInteraction(result) {
  const {
    userId, modelId, inputText, finalResponse,
    wrapperTriggered, inputBiasScore, outputBiasScore,
    confidenceLevel, wrapperReasoning, originalResponse,
    wrapperPrompt, protectedAttributes, proxyVariables,
    decisionPoints, latencyMs,
  } = result;

  // Insert session
  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      model_config_id: modelId,
      input_text: inputText,
      final_response: finalResponse,
      wrapper_triggered: wrapperTriggered,
    })
    .select()
    .single();

  if (sessErr) throw new Error(`Session insert failed: ${sessErr.message}`);

  // Insert bias report
  const { data: report, error: repErr } = await supabase
    .from('bias_reports')
    .insert({
      session_id: session.id,
      input_bias_score: inputBiasScore,
      output_bias_score: outputBiasScore >= 0 ? outputBiasScore : null,
      confidence_level: confidenceLevel,
      wrapper_reasoning: wrapperReasoning,
      original_response: originalResponse,
      wrapper_prompt: wrapperPrompt,
    })
    .select()
    .single();

  if (repErr) throw new Error(`Bias report insert failed: ${repErr.message}`);

  // Insert findings in parallel (fire and forget)
  const findingsPromises = [];

  if (protectedAttributes?.length) {
    findingsPromises.push(
      supabase.from('protected_attribute_findings').insert(
        protectedAttributes.map((a) => ({
          bias_report_id: report.id,
          attribute: a.attribute,
          confidence: a.confidence,
          matched_text: a.matched_text,
          detection_method: a.detection_method,
        }))
      ).then(() => {}).catch(() => {})
    );
  }

  if (proxyVariables?.length) {
    findingsPromises.push(
      supabase.from('proxy_variable_findings').insert(
        proxyVariables.map((p) => ({
          bias_report_id: report.id,
          variable: p.variable,
          mapped_to: p.mapped_to,
          confidence: p.confidence,
        }))
      ).then(() => {}).catch(() => {})
    );
  }

  findingsPromises.push(
    supabase.from('log_entries').insert({
      session_id: session.id,
      user_id: userId,
      prompt_preview: inputText.slice(0, 200),
      input_bias_score: inputBiasScore,
      output_bias_score: outputBiasScore >= 0 ? outputBiasScore : null,
      confidence_level: confidenceLevel,
      wrapper_triggered: wrapperTriggered,
      protected_attributes: protectedAttributes?.map((a) => a.attribute) || [],
      proxy_variables: proxyVariables?.map((p) => p.variable) || [],
      model_id: modelId,
      latency_ms: latencyMs,
    }).then(() => {}).catch(() => {})
  );

  // Local JSONL write (non-blocking)
  const record = JSON.stringify({
    session_id: session.id,
    user_id: userId,
    timestamp: new Date().toISOString(),
    model: modelId,
    input: { text: inputText, input_bias_score: inputBiasScore, protected_attributes: protectedAttributes, proxy_variables: proxyVariables, decision_points: decisionPoints },
    output: { original_response: originalResponse, output_bias_score: outputBiasScore, confidence_level: confidenceLevel, wrapper_triggered: wrapperTriggered, wrapper_reasoning: wrapperReasoning, wrapper_prompt: wrapperPrompt, final_response: finalResponse },
    meta: { latency_ms: latencyMs, pipeline_version: '1.0' },
  });

  findingsPromises.push(
    fs.mkdir(path.dirname(JSONL_PATH), { recursive: true })
      .then(() => fs.appendFile(JSONL_PATH, record + '\n', 'utf8'))
      .then(() => {}).catch(() => {})
  );

  // Fire and forget - don't await
  Promise.all(findingsPromises).catch(() => {});

  return session.id;
}

module.exports = { logInteraction };