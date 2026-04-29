'use strict';
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const router = express.Router();

// Use anon key for auth operations
const authClient = createClient(config.supabase.url, config.supabase.anonKey, {
  auth: { persistSession: false },
});
const supabase = require('../db/supabase_client');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required', code: 'VALIDATION_ERROR' });
  }

  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });

  // Ensure user profile row exists
  await supabase.from('users').upsert({ id: data.user.id, email: data.user.email }, { onConflict: 'id', ignoreDuplicates: true });

  return res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: 'bearer',
    expires_in: data.session.expires_in,
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.headers['authorization']?.slice(7);
  if (token) await authClient.auth.admin?.signOut(token).catch(() => {});
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  return res.json(req.user);
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required', code: 'VALIDATION_ERROR' });
  }

  const { data, error } = await authClient.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message, code: 'SIGNUP_FAILED' });

  return res.status(201).json({ message: 'Account created. Check your email to confirm.', user_id: data.user?.id });
});

module.exports = router;
