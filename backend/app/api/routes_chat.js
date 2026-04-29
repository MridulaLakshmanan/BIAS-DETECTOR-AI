'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const orchestrator = require('../pipeline/orchestrator');
const { listModels } = require('../providers/registry');
const supabase = require('../db/supabase_client');

const router = express.Router();

// POST /api/chat/submit
router.post('/submit', requireAuth, async (req, res) => {
  const { prompt, model_id, force_bias = false } = req.body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required', code: 'VALIDATION_ERROR' });
  }
  if (!model_id) {
    return res.status(400).json({ error: 'model_id is required', code: 'VALIDATION_ERROR' });
  }

  const allModels = listModels().map((m) => m.id);
  if (!allModels.includes(model_id)) {
    return res.status(404).json({ error: `model_id '${model_id}' not found`, code: 'MODEL_NOT_FOUND' });
  }

  try {
    const result = await orchestrator.run({
      prompt: prompt.trim(),
      modelId: model_id,
      userId: req.user.id,
      forceBias: force_bias,
    });
    return res.json({ data: result });
  } catch (err) {
    console.error('Pipeline error:', err);
    return res.status(503).json({ error: 'Pipeline failed: ' + err.message, code: 'PIPELINE_ERROR' });
  }
});

// GET /api/chat/sessions
router.get('/sessions', requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
  const from = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('sessions')
    .select('id, model_config_id, input_text, final_response, wrapper_triggered, created_at', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    data: {
      sessions: (data || []).map((s) => ({
        id: s.id,
        preview: s.input_text?.slice(0, 100),
        model_id: s.model_config_id,
        wrapper_triggered: s.wrapper_triggered,
        created_at: s.created_at,
      })),
      total: count || 0,
      page,
      limit,
    },
  });
});

// GET /api/chat/sessions/:session_id
router.get('/sessions/:session_id', requireAuth, async (req, res) => {
  const { session_id } = req.params;

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !session) return res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });

  const { data: report } = await supabase
    .from('bias_reports')
    .select('*')
    .eq('session_id', session_id)
    .single();

  return res.json({ data: { session, report } });
});

// GET /api/chat/models
router.get('/models', requireAuth, (req, res) => {
  return res.json({ data: { models: listModels() } });
});

module.exports = router;
