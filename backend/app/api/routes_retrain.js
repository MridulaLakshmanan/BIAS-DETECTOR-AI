'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../db/supabase_client');

const router = express.Router();

// In-memory cache of prepared exports keyed by export ID (cleared on restart)
const exportCache = new Map();

// POST /api/retrain/prepare
// Builds a JSONL fine-tuning dataset (OpenAI / HuggingFace messages format)
router.post('/prepare', requireAuth, async (req, res) => {
  try {
    const filters = req.body.filters || {};

    let query = supabase
      .from('sessions')
      .select(`
        id, input_text, final_response, model_config_id, created_at,
        bias_reports (
          input_bias_score, output_bias_score, confidence_level,
          wrapper_reasoning, original_response, wrapper_prompt,
          protected_attribute_findings (attribute, confidence, matched_text, detection_method),
          proxy_variable_findings (variable, mapped_to, confidence)
        )
      `)
      .eq('user_id', req.user.id)
      .eq('wrapper_triggered', true)
      .order('created_at', { ascending: false });

    if (filters.start_date) query = query.gte('created_at', filters.start_date);
    if (filters.end_date)   query = query.lte('created_at', filters.end_date);
    if (filters.limit)      query = query.limit(Math.min(5000, parseInt(filters.limit, 10)));

    const { data: sessions, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Build OpenAI / HuggingFace fine-tuning format:
    // Each record = { messages: [{role,content}, ...], metadata: {...} }
    const records = (sessions || []).map((s) => {
      const report = Array.isArray(s.bias_reports) ? s.bias_reports[0] : s.bias_reports;
      const systemPrompt = [
        'You are a fair, unbiased AI assistant.',
        'Respond accurately without referencing or making assumptions about protected attributes',
        'such as gender, race, age, religion, disability, or socioeconomic status.',
      ].join(' ');

      return {
        messages: [
          { role: 'system',    content: systemPrompt },
          { role: 'user',      content: s.input_text },
          { role: 'assistant', content: s.final_response },
        ],
        metadata: {
          session_id:        s.id,
          model:             s.model_config_id,
          created_at:        s.created_at,
          input_bias_score:  report?.input_bias_score  ?? null,
          output_bias_score: report?.output_bias_score ?? null,
          confidence_level:  report?.confidence_level  ?? null,
          wrapper_reasoning: report?.wrapper_reasoning ?? null,
          protected_attributes: (report?.protected_attribute_findings || []).map((f) => ({
            attribute:        f.attribute,
            confidence:       f.confidence,
            matched_text:     f.matched_text,
            detection_method: f.detection_method,
          })),
          proxy_variables: (report?.proxy_variable_findings || []).map((p) => ({
            variable:   p.variable,
            mapped_to:  p.mapped_to,
            confidence: p.confidence,
          })),
        },
      };
    });

    const exportId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    exportCache.set(exportId, { records, createdAt: Date.now() });

    await supabase.from('retrain_exports').insert({
      created_by:   req.user.id,
      record_count: records.length,
      file_path:    `memory:${exportId}`,
      filters:      Object.keys(filters).length ? filters : null,
    });

    // Prune entries older than 30 min
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [k, v] of exportCache) if (v.createdAt < cutoff) exportCache.delete(k);

    return res.json({ data: { export_id: exportId, record_count: records.length } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/retrain/download/:exportId
// Downloads the dataset as a .jsonl file (one JSON object per line)
router.get('/download/:exportId', requireAuth, (req, res) => {
  const entry = exportCache.get(req.params.exportId);
  if (!entry) return res.status(404).json({ error: 'Export not found or expired. Please prepare again.' });

  const filename = `bias-finetune-${new Date().toISOString().slice(0, 10)}.jsonl`;
  // JSONL: one record per line, no pretty-print
  const jsonl = entry.records.map((r) => JSON.stringify(r)).join('\n');

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', Buffer.byteLength(jsonl));
  res.send(jsonl);
});

// GET /api/retrain/report
// Aggregates model bias performance stats and returns data for HTML report generation
router.get('/report', requireAuth, async (req, res) => {
  try {
    const { data: logs, error: logsErr } = await supabase
      .from('log_entries')
      .select('model_id, input_bias_score, output_bias_score, wrapper_triggered, confidence_level, protected_attributes, created_at, latency_ms')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (logsErr) return res.status(500).json({ error: logsErr.message });

    const all = logs || [];
    const total = all.length;
    const wrapperCount = all.filter((l) => l.wrapper_triggered).length;
    const avgInputBias = total ? all.reduce((s, l) => s + (l.input_bias_score || 0), 0) / total : 0;
    const avgOutputBias = total ? all.filter((l) => l.output_bias_score != null).reduce((s, l) => s + l.output_bias_score, 0) / total : 0;
    const avgLatency = total ? all.filter((l) => l.latency_ms).reduce((s, l) => s + l.latency_ms, 0) / total : 0;

    // Per-model stats
    const modelMap = {};
    all.forEach((l) => {
      const m = l.model_id || 'unknown';
      if (!modelMap[m]) modelMap[m] = { sessions: 0, inputScores: [], outputScores: [], wrappers: 0, latencies: [] };
      modelMap[m].sessions++;
      modelMap[m].inputScores.push(l.input_bias_score || 0);
      if (l.output_bias_score != null) modelMap[m].outputScores.push(l.output_bias_score);
      if (l.wrapper_triggered) modelMap[m].wrappers++;
      if (l.latency_ms) modelMap[m].latencies.push(l.latency_ms);
    });
    const perModel = Object.entries(modelMap).map(([model, s]) => ({
      model,
      sessions:        s.sessions,
      avg_input_bias:  +(s.inputScores.reduce((a, b) => a + b, 0) / s.inputScores.length).toFixed(1),
      avg_output_bias: s.outputScores.length ? +(s.outputScores.reduce((a, b) => a + b, 0) / s.outputScores.length).toFixed(1) : null,
      wrapper_rate:    +((s.wrappers / s.sessions) * 100).toFixed(1),
      avg_latency_ms:  s.latencies.length ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : null,
    })).sort((a, b) => b.avg_input_bias - a.avg_input_bias);

    // Protected attribute breakdown
    const attrMap = {};
    all.forEach((l) => {
      (l.protected_attributes || []).forEach((attr) => {
        if (!attrMap[attr]) attrMap[attr] = { count: 0, scores: [] };
        attrMap[attr].count++;
        attrMap[attr].scores.push(l.input_bias_score || 0);
      });
    });
    const attrBreakdown = Object.entries(attrMap).map(([attr, s]) => ({
      attribute:   attr,
      detections:  s.count,
      avg_bias:    +(s.scores.reduce((a, b) => a + b, 0) / s.count).toFixed(1),
    })).sort((a, b) => b.detections - a.detections);

    // Confidence level breakdown
    const confMap = { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    all.forEach((l) => { if (l.confidence_level) confMap[l.confidence_level] = (confMap[l.confidence_level] || 0) + 1; });

    // Timeseries (last 30 days, grouped by day)
    const since30 = new Date(Date.now() - 30 * 86400000);
    const dayMap = {};
    all.filter((l) => new Date(l.created_at) >= since30).forEach((l) => {
      const day = l.created_at.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { scores: [], wrappers: 0 };
      dayMap[day].scores.push(l.input_bias_score || 0);
      if (l.wrapper_triggered) dayMap[day].wrappers++;
    });
    const timeseries = Object.entries(dayMap).map(([date, d]) => ({
      date,
      avg_bias: +(d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(1),
      wrappers: d.wrappers,
    }));

    return res.json({
      data: {
        generated_at:      new Date().toISOString(),
        summary: {
          total_sessions:     total,
          wrapper_triggers:   wrapperCount,
          wrapper_rate:       total ? +((wrapperCount / total) * 100).toFixed(1) : 0,
          avg_input_bias:     +avgInputBias.toFixed(1),
          avg_output_bias:    +avgOutputBias.toFixed(1),
          bias_reduction_pct: avgInputBias > 0 ? +(((avgInputBias - avgOutputBias) / avgInputBias) * 100).toFixed(1) : 0,
          avg_latency_ms:     Math.round(avgLatency),
          compliance_score:   total ? +(((total - wrapperCount) / total) * 100).toFixed(1) : 100,
        },
        per_model:        perModel,
        attr_breakdown:   attrBreakdown,
        confidence_dist:  confMap,
        timeseries,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;


// POST /api/retrain/prepare
// Aggregates wrapper-triggered sessions into a JSONL-style JSON patch dataset
router.post('/prepare', requireAuth, async (req, res) => {
  try {
    const filters = req.body.filters || {};

    // Pull all wrapper-triggered sessions for this user with bias reports
    let query = supabase
      .from('sessions')
      .select(`
        id, input_text, final_response, model_config_id, created_at,
        bias_reports (
          input_bias_score, output_bias_score, confidence_level,
          wrapper_reasoning, original_response, wrapper_prompt,
          protected_attribute_findings (attribute, confidence, matched_text, detection_method),
          proxy_variable_findings (variable, mapped_to, confidence)
        )
      `)
      .eq('user_id', req.user.id)
      .eq('wrapper_triggered', true)
      .order('created_at', { ascending: false });

    if (filters.start_date) query = query.gte('created_at', filters.start_date);
    if (filters.end_date)   query = query.lte('created_at', filters.end_date);
    if (filters.limit)      query = query.limit(Math.min(5000, parseInt(filters.limit, 10)));

    const { data: sessions, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Build JSONL-style records (instruction-tuning patch format)
    const records = (sessions || []).map((s) => {
      const report = Array.isArray(s.bias_reports) ? s.bias_reports[0] : s.bias_reports;
      return {
        id: s.id,
        created_at: s.created_at,
        model: s.model_config_id,
        prompt: s.input_text,
        biased_completion: report?.original_response || null,
        corrected_completion: s.final_response,
        input_bias_score: report?.input_bias_score ?? null,
        output_bias_score: report?.output_bias_score ?? null,
        confidence_level: report?.confidence_level ?? null,
        wrapper_reasoning: report?.wrapper_reasoning ?? null,
        wrapper_prompt: report?.wrapper_prompt ?? null,
        protected_attributes: (report?.protected_attribute_findings || []).map((f) => ({
          attribute: f.attribute,
          confidence: f.confidence,
          matched_text: f.matched_text,
          detection_method: f.detection_method,
        })),
        proxy_variables: (report?.proxy_variable_findings || []).map((p) => ({
          variable: p.variable,
          mapped_to: p.mapped_to,
          confidence: p.confidence,
        })),
      };
    });

    // Cache it under a short-lived ID
    const exportId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    exportCache.set(exportId, { records, createdAt: Date.now() });

    // Log the export to retrain_exports table
    await supabase.from('retrain_exports').insert({
      created_by: req.user.id,
      record_count: records.length,
      file_path: `memory:${exportId}`,
      filters: Object.keys(filters).length ? filters : null,
    });

    // Prune old cache entries (> 30 min old)
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [k, v] of exportCache) if (v.createdAt < cutoff) exportCache.delete(k);

    return res.json({ data: { export_id: exportId, record_count: records.length } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/retrain/download/:exportId
// Streams the prepared JSON file as a download
router.get('/download/:exportId', requireAuth, (req, res) => {
  const entry = exportCache.get(req.params.exportId);
  if (!entry) return res.status(404).json({ error: 'Export not found or expired. Please prepare again.' });

  const filename = `bias-patch-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify(entry.records, null, 2);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', Buffer.byteLength(json));
  res.send(json);
});

module.exports = router;
