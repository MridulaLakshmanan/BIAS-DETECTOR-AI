'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../db/supabase_client');

const router = express.Router();

// GET /api/logs
router.get('/', requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(200, parseInt(req.query.limit || '50', 10));
  const from = (page - 1) * limit;

  let query = supabase
    .from('log_entries')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (req.query.wrapper_only === 'true') query = query.eq('wrapper_triggered', true);
  if (req.query.confidence) query = query.eq('confidence_level', req.query.confidence.toUpperCase());
  if (req.query.start_date) query = query.gte('created_at', req.query.start_date);
  if (req.query.end_date) query = query.lte('created_at', req.query.end_date);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ data: { logs: data || [], total: count || 0, page, limit } });
});

module.exports = router;
