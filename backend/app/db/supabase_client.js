'use strict';
const config = require('../config');
const { createClient } = (() => {
  try {
    return require('@supabase/supabase-js');
  } catch (err) {
    return {};
  }
})();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// If Supabase config exists, use the Supabase client as before
if (config.supabase && config.supabase.url && config.supabase.serviceRoleKey && createClient) {
  const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
  module.exports = supabase;
  return;
}

// --- SQLite fallback implementation ---
// Lightweight query builder that implements a subset of the Supabase client API
let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  throw new Error('better-sqlite3 is required for SQLite fallback. Install dependencies with `npm install` in backend.');
}

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

function run(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (stmt.reader) return stmt.all(params);
    return stmt.run(params);
  } catch (err) {
    throw err;
  }
}

function ensureSchema() {
  // Simplified SQLite-compatible schema approximating the Postgres schema from docs
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'analyst',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS model_configs (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      context_window INTEGER,
      cost_per_1k_tokens REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      model_config_id TEXT NOT NULL,
      input_text TEXT NOT NULL,
      final_response TEXT NOT NULL,
      wrapper_triggered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bias_reports (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      input_bias_score REAL NOT NULL,
      output_bias_score REAL,
      confidence_level TEXT,
      wrapper_reasoning TEXT,
      original_response TEXT,
      wrapper_prompt TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS protected_attribute_findings (
      id TEXT PRIMARY KEY,
      bias_report_id TEXT NOT NULL,
      attribute TEXT NOT NULL,
      confidence REAL NOT NULL,
      matched_text TEXT,
      detection_method TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proxy_variable_findings (
      id TEXT PRIMARY KEY,
      bias_report_id TEXT NOT NULL,
      variable TEXT NOT NULL,
      mapped_to TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS log_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      prompt_preview TEXT,
      input_bias_score REAL,
      output_bias_score REAL,
      confidence_level TEXT,
      wrapper_triggered INTEGER NOT NULL DEFAULT 0,
      protected_attributes TEXT,
      proxy_variables TEXT,
      model_id TEXT,
      latency_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS retrain_exports (
      id TEXT PRIMARY KEY,
      created_by TEXT,
      record_count INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      filters TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

ensureSchema();

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._wheres = [];
    this._params = [];
    this._order = null;
    this._limit = null;
    this._offset = null;
    this._single = false;
    this._count = false;
    this._rawSelect = null;
  }

  select(cols, opts) {
    if (typeof cols === 'string') this._select = cols;
    else if (Array.isArray(cols)) this._select = cols.join(', ');
    if (opts && opts.count) this._count = true;
    return this;
  }

  eq(col, val) { this._wheres.push(`${col} = ?`); this._params.push(val); return this; }
  gte(col, val) { this._wheres.push(`${col} >= ?`); this._params.push(val); return this; }
  lte(col, val) { this._wheres.push(`${col} <= ?`); this._params.push(val); return this; }
  limit(n) { this._limit = n; return this; }
  range(from, to) { this._offset = from; this._limit = to - from + 1; return this; }
  order(col, opts) { this._order = `${col} ${opts && opts.ascending ? 'ASC' : 'DESC'}`; return this; }
  textSearch(col, term) { this._wheres.push(`LOWER(${col}) LIKE ?`); this._params.push(`%${String(term).toLowerCase()}%`); return this; }
  single() { this._single = true; return this; }

  async _execSelect() {
    const where = this._wheres.length ? `WHERE ${this._wheres.join(' AND ')}` : '';
    const order = this._order ? `ORDER BY ${this._order}` : '';
    const limit = (this._limit != null) ? `LIMIT ${this._limit}` : '';
    const offset = (this._offset != null) ? `OFFSET ${this._offset}` : '';
    const sql = `SELECT ${this._select} FROM ${this.table} ${where} ${order} ${limit} ${offset}`;
    try {
      const stmt = db.prepare(sql);
      const rows = stmt.all(this._params);
      let count = null;
      if (this._count) {
        const csql = `SELECT COUNT(1) AS cnt FROM ${this.table} ${where}`;
        const crow = db.prepare(csql).get(this._params);
        count = crow ? crow.cnt : 0;
      }
      const data = this._single ? (rows[0] || null) : rows;
      return { data, error: null, count };
    } catch (err) {
      return { data: null, error: err, count: null };
    }
  }

  async insert(obj) {
    if (!obj.id) obj.id = crypto.randomUUID();
    const cols = Object.keys(obj);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES (${placeholders})`;
    const params = cols.map((c) => {
      const v = obj[c];
      if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v;
    });
    try {
      db.prepare(sql).run(params);
      // return the inserted row
      const { data } = await new QueryBuilder(this.table).select('*').eq('id', obj.id).single()._execSelect();
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  async upsert(objs, opts) {
    // Support upsert for array or single object. We'll use INSERT OR REPLACE based on id.
    const arr = Array.isArray(objs) ? objs : [objs];
    try {
      const insert = db.prepare;
      const tx = db.transaction((rows) => {
        for (const obj of rows) {
          if (!obj.id) obj.id = crypto.randomUUID();
          const cols = Object.keys(obj);
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT OR REPLACE INTO ${this.table} (${cols.join(', ')}) VALUES (${placeholders})`;
          const params = cols.map((c) => {
            const v = obj[c];
            if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
            if (typeof v === 'boolean') return v ? 1 : 0;
            return v;
          });
          db.prepare(sql).run(params);
        }
      });
      tx(arr);
      return { data: arr, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  async update(obj) {
    // Update based on previously set where clauses
    const where = this._wheres.length ? `WHERE ${this._wheres.join(' AND ')}` : '';
    const cols = Object.keys(obj);
    const set = cols.map((c) => `${c} = ?`).join(', ');
    const params = cols.map((c) => {
      const v = obj[c];
      if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v;
    }).concat(this._params);
    const sql = `UPDATE ${this.table} SET ${set} ${where}`;
    try {
      db.prepare(sql).run(params);
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }
}

const client = {
  from: (table) => new QueryBuilder(table),
  _isSqlite: true,
  // helper to run arbitrary SQL (for migrations / debugging)
  _runSql: (sql) => db.exec(sql),
};

module.exports = client;
