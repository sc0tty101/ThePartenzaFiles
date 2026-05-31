const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entries (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT[] DEFAULT '{}',
      review TEXT,
      rating INTEGER DEFAULT 3,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT INTO config (key, value)
    VALUES
      ('passwordHash', '$2b$10$placeholder'),
      ('siteTitle', 'The Partenza Files'),
      ('siteTagline', 'A curated archive of accidents, disasters, and the stories they leave behind.')
    ON CONFLICT (key) DO NOTHING;
  `);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'partenza-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

async function getConfig() {
  const res = await pool.query('SELECT key, value FROM config');
  return Object.fromEntries(res.rows.map(r => [r.key, r.value]));
}

async function setConfig(key, value) {
  await pool.query(
    'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, value]
  );
}

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Public: get all entries
app.get('/api/entries', async (req, res) => {
  const result = await pool.query('SELECT * FROM entries ORDER BY created_at DESC');
  res.json(result.rows.map(normalizeEntry));
});

// Public: get site config
app.get('/api/config', async (req, res) => {
  const config = await getConfig();
  res.json({ siteTitle: config.siteTitle, siteTagline: config.siteTagline });
});

// Auth: login
app.post('/api/login', async (req, res) => {
  const config = await getConfig();
  const match = await bcrypt.compare(req.body.password, config.passwordHash);
  if (match) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Incorrect password' });
  }
});

// Auth: logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Auth: check session
app.get('/api/session', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// Setup: set initial password (only works once)
app.post('/api/setup', async (req, res) => {
  const config = await getConfig();
  if (config.passwordHash !== '$2b$10$placeholder') {
    return res.status(400).json({ error: 'Already set up' });
  }
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const hash = await bcrypt.hash(password, 10);
  await setConfig('passwordHash', hash);
  req.session.authenticated = true;
  res.json({ ok: true });
});

// Admin: create entry
app.post('/api/entries', requireAuth, async (req, res) => {
  const tags = parseTags(req.body.tags);
  const result = await pool.query(
    `INSERT INTO entries (id, title, url, type, tags, review, rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [uuidv4(), req.body.title, req.body.url, req.body.type, tags, req.body.review, parseInt(req.body.rating) || 3]
  );
  res.json(normalizeEntry(result.rows[0]));
});

// Admin: update entry
app.put('/api/entries/:id', requireAuth, async (req, res) => {
  const tags = parseTags(req.body.tags);
  const result = await pool.query(
    `UPDATE entries SET title=$1, url=$2, type=$3, tags=$4, review=$5, rating=$6, updated_at=NOW()
     WHERE id=$7 RETURNING *`,
    [req.body.title, req.body.url, req.body.type, tags, req.body.review, parseInt(req.body.rating) || 3, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(normalizeEntry(result.rows[0]));
});

// Admin: delete entry
app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM entries WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Admin: update site config
app.put('/api/config', requireAuth, async (req, res) => {
  if (req.body.siteTitle) await setConfig('siteTitle', req.body.siteTitle);
  if (req.body.siteTagline) await setConfig('siteTagline', req.body.siteTagline);
  res.json({ ok: true });
});

// Admin: change password
app.post('/api/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  await setConfig('passwordHash', await bcrypt.hash(newPassword, 10));
  res.json({ ok: true });
});

function parseTags(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

function normalizeEntry(row) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    type: row.type,
    tags: row.tags || [],
    review: row.review,
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`The Partenza Files running at http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
