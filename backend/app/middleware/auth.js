'use strict';
/**
 * Auth middleware — verifies Supabase JWT from Authorization header when Supabase is configured.
 * When Supabase is not configured, falls back to a simple header-based user mapping stored in the local `users` table.
 * Attaches req.user = { id, email, role } on success.
 */
const config = require('../config');
let anonClient = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  if (config.supabase && config.supabase.url && config.supabase.anonKey) {
    anonClient = createClient(config.supabase.url, config.supabase.anonKey, { auth: { persistSession: false } });
  }
} catch (err) {
  // Supabase client not installed — will use fallback
}

const dbClient = require('../db/supabase_client');

async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' });
  }

  const token = authHeader.slice(7);

  if (anonClient) {
    // Use Supabase Auth to validate token
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
    }

    // Fetch application role from users table
    const { data: profile, error: pErr } = await dbClient
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (pErr) return res.status(500).json({ error: pErr.message });
    if (profile && profile.is_active === 0) {
      return res.status(403).json({ error: 'Account disabled', code: 'FORBIDDEN' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || 'analyst',
    };
    return next();
  }

  // Fallback: in non-supabase mode, accept token value as user id or email for dev testing
  // Token format: 'dev:<user_id>' or 'dev-email:<email>'
  if (token.startsWith('dev:')) {
    const uid = token.slice(4);
    const { data, error } = await dbClient.from('users').select('id, email, role, is_active').eq('id', uid).single();
    if (error || !data) return res.status(401).json({ error: 'Invalid dev token', code: 'UNAUTHORIZED' });
    if (data.is_active === 0) return res.status(403).json({ error: 'Account disabled', code: 'FORBIDDEN' });
    req.user = { id: data.id, email: data.email, role: data.role || 'analyst' };
    return next();
  }
  if (token.startsWith('dev-email:')) {
    const email = token.slice(10);
    const { data, error } = await dbClient.from('users').select('id, email, role, is_active').eq('email', email).single();
    if (error || !data) return res.status(401).json({ error: 'Invalid dev token', code: 'UNAUTHORIZED' });
    if (data.is_active === 0) return res.status(403).json({ error: 'Account disabled', code: 'FORBIDDEN' });
    req.user = { id: data.id, email: data.email, role: data.role || 'analyst' };
    return next();
  }

  return res.status(401).json({ error: 'No Supabase configured and token not a valid dev token', code: 'UNAUTHORIZED' });
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
