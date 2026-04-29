'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../db/supabase_client');

const router = express.Router();

// GET /api/dashboard/stats — returns stats for the authenticated user
router.get('/stats', requireAuth, async (req, res) => {
  const { data: logs, error } = await supabase
    .from('log_entries')
    .select('input_bias_score, output_bias_score, wrapper_triggered, created_at')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });

  const total = logs?.length || 0;
  const avgBias = total ? logs.reduce((s, l) => s + (l.input_bias_score || 0), 0) / total : 0;
  const wrapperCount = logs?.filter((l) => l.wrapper_triggered).length || 0;

  // Sessions today
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = logs?.filter((l) => new Date(l.created_at) >= today).length || 0;

  return res.json({
    data: {
      total_sessions: total,
      average_bias_score: Math.round(avgBias * 10) / 10,
      wrapper_trigger_rate: total ? Math.round((wrapperCount / total) * 1000) / 1000 : 0,
      compliance_score: total ? Math.round(((total - wrapperCount) / total) * 100) / 100 : 1,
      sessions_today: todayCount,
    },
  });
});

// GET /api/dashboard/timeseries
router.get('/timeseries', requireAuth, async (req, res) => {
  const period = req.query.period || '7d';
  const days = period === '24h' ? 1 : period === '30d' ? 30 : period === '90d' ? 90 : 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: logs } = await supabase
    .from('log_entries')
    .select('input_bias_score, wrapper_triggered, created_at')
    .eq('user_id', req.user.id)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  // Group by day
  const groups = {};
  (logs || []).forEach((l) => {
    const day = l.created_at.slice(0, 10);
    if (!groups[day]) groups[day] = { scores: [], wrappers: 0 };
    groups[day].scores.push(l.input_bias_score || 0);
    if (l.wrapper_triggered) groups[day].wrappers++;
  });

  const labels = Object.keys(groups).map((d) => new Date(d).toLocaleDateString('en', { weekday: 'short' }));
  const biasData = Object.values(groups).map((g) => Math.round(g.scores.reduce((a, b) => a + b, 0) / g.scores.length));
  const wrapperData = Object.values(groups).map((g) => g.wrappers);

  return res.json({
    data: {
      labels,
      datasets: [
        { label: 'Avg Bias Score', data: biasData },
        { label: 'Wrapper Triggers', data: wrapperData },
      ],
    },
  });
});

// GET /api/dashboard/attribute-heatmap
router.get('/attribute-heatmap', requireAuth, async (req, res) => {
  const { data: logs } = await supabase
    .from('log_entries')
    .select('protected_attributes, input_bias_score, wrapper_triggered')
    .eq('user_id', req.user.id);

  const attrStats = {};
  (logs || []).forEach((l) => {
    (l.protected_attributes || []).forEach((attr) => {
      if (!attrStats[attr]) attrStats[attr] = { scores: [], wrappers: 0, count: 0 };
      attrStats[attr].count++;
      attrStats[attr].scores.push(l.input_bias_score || 0);
      if (l.wrapper_triggered) attrStats[attr].wrappers++;
    });
  });

  const attributes = Object.entries(attrStats).map(([attribute, s]) => ({
    attribute,
    detection_count: s.count,
    average_bias_score: Math.round(s.scores.reduce((a, b) => a + b, 0) / s.count * 10) / 10,
    wrapper_rate: Math.round((s.wrappers / s.count) * 100) / 100,
  }));

  return res.json({ data: { attributes } });
});

module.exports = router;
