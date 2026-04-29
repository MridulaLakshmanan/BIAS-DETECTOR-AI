'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../db/supabase_client');

const router = express.Router();

// GET /api/bias/report/:session_id
router.get('/report/:session_id', requireAuth, async (req, res) => {
  const { session_id } = req.params;

  // Verify session belongs to user
  const { data: session } = await supabase
    .from('sessions')
    .select('user_id')
    .eq('id', session_id)
    .single();

  if (!session) return res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });
  if (session.user_id !== req.user.id && req.user.role === 'viewer') {
    return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
  }

  const { data: report } = await supabase
    .from('bias_reports')
    .select(`
      *,
      protected_attribute_findings(*),
      proxy_variable_findings(*)
    `)
    .eq('session_id', session_id)
    .single();

  if (!report) return res.status(404).json({ error: 'Bias report not found', code: 'NOT_FOUND' });

  return res.json({ data: report });
});

// GET /api/bias/summary
router.get('/summary', requireAuth, async (req, res) => {
  const { data: logs } = await supabase
    .from('log_entries')
    .select('input_bias_score, output_bias_score, wrapper_triggered, protected_attributes')
    .eq('user_id', req.user.id);

  if (!logs || !logs.length) {
    return res.json({ data: { total_sessions: 0, average_input_bias_score: 0, average_output_bias_score: 0, wrapper_triggered_count: 0, wrapper_trigger_rate: 0, most_common_attributes: [] } });
  }

  const total = logs.length;
  const avgInput = logs.reduce((s, l) => s + (l.input_bias_score || 0), 0) / total;
  const avgOutput = logs.reduce((s, l) => s + (l.output_bias_score || 0), 0) / total;
  const wrapperCount = logs.filter((l) => l.wrapper_triggered).length;

  // Count attributes
  const attrCount = {};
  logs.forEach((l) => (l.protected_attributes || []).forEach((a) => { attrCount[a] = (attrCount[a] || 0) + 1; }));
  const mostCommon = Object.entries(attrCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([attribute, count]) => ({ attribute, count }));

  return res.json({
    data: {
      total_sessions: total,
      average_input_bias_score: Math.round(avgInput * 10) / 10,
      average_output_bias_score: Math.round(avgOutput * 10) / 10,
      wrapper_triggered_count: wrapperCount,
      wrapper_trigger_rate: Math.round((wrapperCount / total) * 1000) / 1000,
      most_common_attributes: mostCommon,
    },
  });
});

module.exports = router;
