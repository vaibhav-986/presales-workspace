import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createId, hashPassword } from './auth.js';

const now = () => new Date().toISOString();

export function createDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      visit_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      property_name TEXT NOT NULL,
      property_location TEXT NOT NULL,
      presaler_name TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('Discovery', 'Demo', 'Proposal', 'Negotiation', 'Won', 'Lost')),
      software_type TEXT NOT NULL,
      property_category TEXT NOT NULL,
      won_amount INTEGER NOT NULL DEFAULT 0 CHECK (won_amount >= 0),
      current_pms TEXT NOT NULL DEFAULT '',
      attendees TEXT NOT NULL DEFAULT '',
      requirement_description TEXT NOT NULL DEFAULT '',
      issues_faced TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opportunities_date ON opportunities(visit_date DESC);
    CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_opportunities_presaler ON opportunities(presaler_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  `);

  return db;
}

export function seedAdmin(db, config = {}) {
  const email = (config.email || process.env.ADMIN_EMAIL || 'admin@presales.local').trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;

  const developmentPassword = 'Presales@2026';
  const configuredPassword = config.password || process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production' && (!configuredPassword || configuredPassword === developmentPassword)) {
    throw new Error('ADMIN_PASSWORD must be set to a non-default value before starting in production.');
  }
  const password = configuredPassword || developmentPassword;
  const name = config.name || process.env.ADMIN_NAME || 'Workspace Admin';
  const { salt, hash } = hashPassword(password);
  const id = createId('usr');
  const timestamp = now();
  db.prepare(`
    INSERT INTO users (id, email, name, title, role, status, password_hash, password_salt, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?, ?)
  `).run(id, email, name, 'Presales Administrator', hash, salt, timestamp, timestamp);
  return id;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    title: row.title,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}
