import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { z } from 'zod';
import { createDatabase, publicUser, seedAdmin } from './db.js';
import { createId, createOpaqueToken, hashPassword, tokenDigest, verifyPassword } from './auth.js';

const SESSION_COOKIE = 'presales_session';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const STAGES = ['Discovery', 'Demo', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const SOFTWARE_TYPES = ['Cloud PMS', 'On-premise PMS', 'POS', 'CRM', 'Other'];
const PROPERTY_CATEGORIES = ['Hotel', 'Resort', 'Hostel', 'Serviced Apartment', 'Restaurant', 'Other'];

const opportunitySchema = z.object({
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a valid start time'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a valid end time'),
  propertyName: z.string().trim().min(2).max(160),
  propertyLocation: z.string().trim().min(2).max(160),
  presalerName: z.string().trim().min(2).max(120),
  stage: z.enum(STAGES),
  softwareType: z.enum(SOFTWARE_TYPES),
  propertyCategory: z.enum(PROPERTY_CATEGORIES),
  wonAmount: z.coerce.number().int().min(0).max(1_000_000_000_000),
  currentPms: z.string().trim().max(160).default(''),
  attendees: z.string().trim().max(1000).default(''),
  requirementDescription: z.string().trim().max(10000).default(''),
  issuesFaced: z.string().trim().max(10000).default(''),
}).superRefine((value, context) => {
  if (value.endTime <= value.startTime) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time' });
  }
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(256),
});

const userSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  title: z.string().trim().max(120).default(''),
  role: z.enum(['admin', 'manager', 'member', 'viewer']),
  password: z.string().min(10).max(128),
});

const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  title: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'manager', 'member', 'viewer']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'No changes provided');

const now = () => new Date().toISOString();

function serializeOpportunity(row) {
  return {
    id: row.id,
    visitDate: row.visit_date,
    startTime: row.start_time,
    endTime: row.end_time,
    propertyName: row.property_name,
    propertyLocation: row.property_location,
    presalerName: row.presaler_name,
    stage: row.stage,
    softwareType: row.software_type,
    propertyCategory: row.property_category,
    wonAmount: row.won_amount,
    currentPms: row.current_pms,
    attendees: row.attendees,
    requirementDescription: row.requirement_description,
    issuesFaced: row.issues_faced,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validationError(error) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please correct the highlighted fields.',
      fields: Object.fromEntries(error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message])),
    },
  };
}

function quarterRange(date = new Date()) {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  const from = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth + 3, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function csvCell(value) {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function checkOrigin(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = new Set([
    `${req.protocol}://${req.get('host')}`,
    process.env.APP_ORIGIN,
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ].filter(Boolean));
  if (!allowed.has(origin)) return res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' } });
  return next();
}

function sessionFromRequest(db, req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const digest = tokenDigest(token);
  const row = db.prepare(`
    SELECT s.token_hash, s.csrf_token, s.expires_at, u.*
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
  `).get(digest, now());
  return row ? { tokenHash: row.token_hash, csrfToken: row.csrf_token, user: row } : null;
}

export function createApp(options = {}) {
  const databasePath = options.databasePath || process.env.DATABASE_PATH || path.resolve('data/presales.db');
  const db = options.db || createDatabase(databasePath);
  seedAdmin(db, options.admin);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());

  const app = express();
  app.locals.db = db;
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(checkOrigin);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.loginLimit || 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please wait and try again.' } },
  });

  app.post('/api/auth/login', loginLimiter, (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(validationError(parsed.error));

    const email = parsed.data.email.toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || user.status !== 'active' || !verifyPassword(parsed.data.password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    }

    const token = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const ttlHours = Number(process.env.SESSION_TTL_HOURS || 12);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
    const timestamp = now();
    db.prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(tokenDigest(token), user.id, csrfToken, expiresAt, timestamp);
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(timestamp, timestamp, user.id);

    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ttlHours * 60 * 60 * 1000,
    });
    return res.json({ data: { user: publicUser({ ...user, last_login_at: timestamp }), csrfToken } });
  });

  function requireAuth(req, res, next) {
    const session = sessionFromRequest(db, req);
    if (!session) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } });
    req.auth = session;
    return next();
  }

  function requireCsrf(req, res, next) {
    if (!UNSAFE_METHODS.has(req.method)) return next();
    const token = req.get('x-csrf-token');
    if (!token || token !== req.auth.csrfToken) {
      return res.status(403).json({ error: { code: 'CSRF_FAILED', message: 'Security token is missing or invalid. Refresh and try again.' } });
    }
    return next();
  }

  function requireRole(...roles) {
    return (req, res, next) => roles.includes(req.auth.user.role)
      ? next()
      : res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' } });
  }

  app.get('/api/auth/session', requireAuth, (req, res) => {
    res.json({ data: { user: publicUser(req.auth.user), csrfToken: req.auth.csrfToken } });
  });

  app.post('/api/auth/logout', requireAuth, requireCsrf, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.auth.tokenHash);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  const api = express.Router();
  api.use(requireAuth, requireCsrf);

  api.get('/meta', (_req, res) => {
    res.json({ data: { stages: STAGES, softwareTypes: SOFTWARE_TYPES, propertyCategories: PROPERTY_CATEGORIES } });
  });

  api.get('/dashboard', (_req, res) => {
    const { from, to } = quarterRange();
    const won = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(won_amount), 0) AS amount FROM opportunities WHERE stage = 'Won' AND visit_date BETWEEN ? AND ?").get(from, to);
    const active = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(won_amount), 0) AS amount FROM opportunities WHERE stage NOT IN ('Won', 'Lost')").get();
    const closed = db.prepare("SELECT stage, COUNT(*) AS count FROM opportunities WHERE stage IN ('Won', 'Lost') AND visit_date BETWEEN ? AND ? GROUP BY stage").all(from, to);
    const wonCount = Number(closed.find((row) => row.stage === 'Won')?.count || 0);
    const lostCount = Number(closed.find((row) => row.stage === 'Lost')?.count || 0);
    const stageRows = db.prepare('SELECT stage, COUNT(*) AS count, COALESCE(SUM(won_amount), 0) AS amount FROM opportunities GROUP BY stage').all();
    const recent = db.prepare('SELECT * FROM opportunities ORDER BY visit_date DESC, created_at DESC LIMIT 6').all().map(serializeOpportunity);
    const totalCount = Number(db.prepare('SELECT COUNT(*) AS count FROM opportunities').get().count);

    res.json({
      data: {
        range: { from, to },
        wonThisQuarter: { count: Number(won.count), amount: Number(won.amount) },
        activeOpportunities: { count: Number(active.count), amount: Number(active.amount) },
        winRate: wonCount + lostCount ? Math.round((wonCount / (wonCount + lostCount)) * 1000) / 10 : 0,
        totalCount,
        stages: STAGES.map((stage) => {
          const match = stageRows.find((row) => row.stage === stage);
          return { stage, count: Number(match?.count || 0), amount: Number(match?.amount || 0) };
        }),
        recent,
      },
    });
  });

  api.get('/opportunities', (req, res) => {
    const search = String(req.query.search || '').trim();
    const stage = String(req.query.stage || '').trim();
    const conditions = [];
    const values = [];
    if (search) {
      conditions.push("(property_name LIKE ? ESCAPE '\\' OR property_location LIKE ? ESCAPE '\\' OR presaler_name LIKE ? ESCAPE '\\')");
      const escaped = search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
      const like = `%${escaped}%`;
      values.push(like, like, like);
    }
    if (stage && STAGES.includes(stage)) {
      conditions.push('stage = ?');
      values.push(stage);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM opportunities ${where} ORDER BY visit_date DESC, created_at DESC LIMIT 200`).all(...values);
    res.json({ data: rows.map(serializeOpportunity), meta: { count: rows.length } });
  });

  api.get('/opportunities/export.csv', (req, res) => {
    const rows = db.prepare('SELECT * FROM opportunities ORDER BY visit_date DESC, created_at DESC').all();
    const headers = ['visitDate', 'startTime', 'endTime', 'propertyName', 'propertyLocation', 'presalerName', 'stage', 'softwareType', 'propertyCategory', 'wonAmount', 'currentPms', 'attendees', 'requirementDescription', 'issuesFaced'];
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows.map(serializeOpportunity)) lines.push(headers.map((header) => csvCell(row[header])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="opportunities-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${lines.join('\r\n')}`);
  });

  api.get('/opportunities/template.csv', (_req, res) => {
    const headers = ['visitDate', 'startTime', 'endTime', 'propertyName', 'propertyLocation', 'presalerName', 'stage', 'softwareType', 'propertyCategory', 'wonAmount', 'currentPms', 'attendees', 'requirementDescription', 'issuesFaced'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="opportunity-import-template.csv"');
    res.send(`${headers.join(',')}\r\n2026-11-24,10:00,11:00,Example Hotel,City Country,Workspace Admin,Discovery,Cloud PMS,Hotel,250000,Legacy PMS,Owner and GM,Needs a modern cloud PMS,Manual reporting`);
  });

  api.post('/opportunities', requireRole('admin', 'manager', 'member'), (req, res) => {
    const parsed = opportunitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json(validationError(parsed.error));
    const value = parsed.data;
    const id = createId('opp');
    const timestamp = now();
    db.prepare(`
      INSERT INTO opportunities (
        id, visit_date, start_time, end_time, property_name, property_location,
        presaler_name, stage, software_type, property_category, won_amount,
        current_pms, attendees, requirement_description, issues_faced,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, value.visitDate, value.startTime, value.endTime, value.propertyName, value.propertyLocation,
      value.presalerName, value.stage, value.softwareType, value.propertyCategory, value.wonAmount,
      value.currentPms, value.attendees, value.requirementDescription, value.issuesFaced,
      req.auth.user.id, timestamp, timestamp,
    );
    const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
    return res.status(201).json({ data: serializeOpportunity(row) });
  });

  api.patch('/opportunities/:id', requireRole('admin', 'manager', 'member'), (req, res) => {
    const existing = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Opportunity not found.' } });
    const merged = {
      ...serializeOpportunity(existing),
      ...req.body,
    };
    const parsed = opportunitySchema.safeParse(merged);
    if (!parsed.success) return res.status(422).json(validationError(parsed.error));
    const value = parsed.data;
    db.prepare(`
      UPDATE opportunities SET
        visit_date = ?, start_time = ?, end_time = ?, property_name = ?, property_location = ?,
        presaler_name = ?, stage = ?, software_type = ?, property_category = ?, won_amount = ?,
        current_pms = ?, attendees = ?, requirement_description = ?, issues_faced = ?, updated_at = ?
      WHERE id = ?
    `).run(
      value.visitDate, value.startTime, value.endTime, value.propertyName, value.propertyLocation,
      value.presalerName, value.stage, value.softwareType, value.propertyCategory, value.wonAmount,
      value.currentPms, value.attendees, value.requirementDescription, value.issuesFaced, now(), req.params.id,
    );
    return res.json({ data: serializeOpportunity(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id)) });
  });

  api.delete('/opportunities/:id', requireRole('admin', 'manager'), (req, res) => {
    const result = db.prepare('DELETE FROM opportunities WHERE id = ?').run(req.params.id);
    return result.changes ? res.status(204).end() : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Opportunity not found.' } });
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => callback(null, /\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv'),
  });

  api.post('/opportunities/import', requireRole('admin', 'manager'), upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: { code: 'FILE_REQUIRED', message: 'Choose a CSV file to import.' } });
    let records;
    try {
      records = parseCsv(req.file.buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true, max_record_size: 100_000 });
    } catch {
      return res.status(422).json({ error: { code: 'INVALID_CSV', message: 'The CSV file could not be parsed.' } });
    }
    if (records.length > 1000) return res.status(413).json({ error: { code: 'TOO_MANY_ROWS', message: 'Imports are limited to 1,000 rows.' } });

    const validated = [];
    const errors = [];
    records.forEach((record, index) => {
      const parsed = opportunitySchema.safeParse(record);
      if (parsed.success) validated.push(parsed.data);
      else errors.push({ row: index + 2, fields: validationError(parsed.error).error.fields });
    });
    if (errors.length) return res.status(422).json({ error: { code: 'IMPORT_VALIDATION_FAILED', message: `${errors.length} row(s) need attention.`, rows: errors.slice(0, 50) } });

    const insert = db.prepare(`
      INSERT INTO opportunities (
        id, visit_date, start_time, end_time, property_name, property_location,
        presaler_name, stage, software_type, property_category, won_amount,
        current_pms, attendees, requirement_description, issues_faced,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const value of validated) {
        const timestamp = now();
        insert.run(
          createId('opp'), value.visitDate, value.startTime, value.endTime, value.propertyName, value.propertyLocation,
          value.presalerName, value.stage, value.softwareType, value.propertyCategory, value.wonAmount,
          value.currentPms, value.attendees, value.requirementDescription, value.issuesFaced,
          req.auth.user.id, timestamp, timestamp,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return res.status(201).json({ data: { imported: validated.length } });
  });

  api.get('/users', requireRole('admin'), (_req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map(publicUser);
    res.json({ data: users });
  });

  api.post('/users', requireRole('admin'), (req, res) => {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json(validationError(parsed.error));
    const value = parsed.data;
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(value.email.toLowerCase())) {
      return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'A user with this email already exists.', fields: { email: 'Email is already in use' } } });
    }
    const id = createId('usr');
    const timestamp = now();
    const { hash, salt } = hashPassword(value.password);
    db.prepare(`
      INSERT INTO users (id, email, name, title, role, status, password_hash, password_salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(id, value.email.toLowerCase(), value.name, value.title, value.role, hash, salt, timestamp, timestamp);
    res.status(201).json({ data: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  });

  api.patch('/users/:id', requireRole('admin'), (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json(validationError(parsed.error));
    const next = { ...user, ...parsed.data };
    if (user.id === req.auth.user.id && next.status === 'disabled') {
      return res.status(422).json({ error: { code: 'SELF_DISABLE', message: 'You cannot disable your own account.' } });
    }
    if (user.role === 'admin' && (next.role !== 'admin' || next.status !== 'active')) {
      const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get();
      if (Number(admins.count) <= 1) return res.status(422).json({ error: { code: 'LAST_ADMIN', message: 'At least one active administrator is required.' } });
    }
    db.prepare('UPDATE users SET name = ?, title = ?, role = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(next.name, next.title, next.role, next.status, now(), user.id);
    if (next.status === 'disabled') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    res.json({ data: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
  });

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }));

  const distPath = path.resolve('dist');
  if (fs.existsSync(distPath)) {
    app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y' }));
    app.get('/favicon.ico', (_req, res) => res.status(204).end());
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path !== '/login' && !sessionFromRequest(db, req)) return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
    }
    console.error(error);
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: error.code, message: 'The uploaded file could not be accepted.' } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'))) {
  const port = Number(process.env.PORT || 4174);
  const app = createApp();
  app.listen(port, '127.0.0.1', () => {
    console.log(`Presales API listening at http://127.0.0.1:${port}`);
  });
}
