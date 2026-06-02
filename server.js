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

function slugify(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents: Ü→U, é→e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id UUID PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT,
      location_name TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      tags TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS entries (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT[] DEFAULT '{}',
      review TEXT,
      rating INTEGER DEFAULT 3,
      location_name TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
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
      ('siteTagline', 'A curated archive of accidents, disasters, and the stories they leave behind.'),
      ('entryTypes', '["video","article","podcast","book"]')
    ON CONFLICT (key) DO NOTHING;
  `);

  await pool.query(`
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS location_name TEXT;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS is_fictional BOOLEAN DEFAULT FALSE;
    ALTER TABLE entries ALTER COLUMN rating DROP DEFAULT;
    ALTER TABLE entries ALTER COLUMN rating DROP NOT NULL;
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

app.get('/api/incidents', async (req, res) => {
  const result = await pool.query(`
    SELECT i.*,
      COUNT(e.id)::int AS entry_count,
      COALESCE(array_agg(DISTINCT e.type) FILTER (WHERE e.type IS NOT NULL), '{}') AS entry_types
    FROM incidents i
    LEFT JOIN entries e ON e.incident_id = i.id
    GROUP BY i.id
    ORDER BY i.created_at DESC
  `);
  res.json(result.rows.map(normalizeIncident));
});

app.get('/api/incidents/by-slug/:slug', async (req, res) => {
  const incRes = await pool.query('SELECT * FROM incidents WHERE slug=$1', [req.params.slug]);
  if (incRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const incident = normalizeIncident(incRes.rows[0]);
  const entriesRes = await pool.query(
    'SELECT * FROM entries WHERE incident_id=$1 ORDER BY created_at DESC',
    [incident.id]
  );
  incident.entries = entriesRes.rows.map(normalizeEntry);
  res.json(incident);
});

app.post('/api/incidents', requireAuth, async (req, res) => {
  const tags = parseTags(req.body.tags);
  const slug = req.body.slug || slugify(req.body.title);
  const result = await pool.query(
    `INSERT INTO incidents (id, slug, title, description, date, location_name, lat, lng, tags, image_url, is_fictional)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [uuidv4(), slug, req.body.title, req.body.description || null, req.body.date || null,
     req.body.location_name || null,
     req.body.lat ? parseFloat(req.body.lat) : null,
     req.body.lng ? parseFloat(req.body.lng) : null,
     tags, req.body.image_url || null, req.body.is_fictional === true || req.body.is_fictional === 'true']
  );
  res.json(normalizeIncident(result.rows[0]));
});

app.put('/api/incidents/:id', requireAuth, async (req, res) => {
  const tags = parseTags(req.body.tags);
  const slug = req.body.slug || slugify(req.body.title);
  const result = await pool.query(
    `UPDATE incidents SET slug=$1, title=$2, description=$3, date=$4, location_name=$5,
     lat=$6, lng=$7, tags=$8, image_url=$9, is_fictional=$10, updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [slug, req.body.title, req.body.description || null, req.body.date || null,
     req.body.location_name || null,
     req.body.lat ? parseFloat(req.body.lat) : null,
     req.body.lng ? parseFloat(req.body.lng) : null,
     tags, req.body.image_url || null,
     req.body.is_fictional === true || req.body.is_fictional === 'true',
     req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(normalizeIncident(result.rows[0]));
});

app.delete('/api/incidents/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM incidents WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/entries', async (req, res) => {
  const result = await pool.query('SELECT * FROM entries ORDER BY created_at DESC');
  res.json(result.rows.map(normalizeEntry));
});

app.get('/api/config', async (req, res) => {
  const config = await getConfig();
  res.json({ siteTitle: config.siteTitle, siteTagline: config.siteTagline });
});

app.get('/api/entry-types', async (req, res) => {
  const config = await getConfig();
  const types = config.entryTypes ? JSON.parse(config.entryTypes) : ['video', 'article', 'podcast', 'book'];
  res.json(types);
});

app.put('/api/entry-types', requireAuth, async (req, res) => {
  const { types } = req.body;
  if (!Array.isArray(types) || types.some(t => typeof t !== 'string' || !t.trim())) {
    return res.status(400).json({ error: 'types must be a non-empty array of strings' });
  }
  await setConfig('entryTypes', JSON.stringify(types.map(t => t.trim().toLowerCase())));
  res.json({ ok: true });
});

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

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

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

app.post('/api/entries', requireAuth, async (req, res) => {
  const tags = parseTags(req.body.tags);
  const result = await pool.query(
    `INSERT INTO entries (id, title, url, type, tags, review, rating, location_name, lat, lng, incident_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [uuidv4(), req.body.title, req.body.url, req.body.type, tags, req.body.review,
     req.body.rating != null && req.body.rating !== '' ? parseInt(req.body.rating) : null,
     req.body.location_name || null,
     req.body.lat ? parseFloat(req.body.lat) : null,
     req.body.lng ? parseFloat(req.body.lng) : null,
     req.body.incident_id || null]
  );
  res.json(normalizeEntry(result.rows[0]));
});

app.put('/api/entries/:id', requireAuth, async (req, res) => {
  const tags = parseTags(req.body.tags);
  const result = await pool.query(
    `UPDATE entries SET title=$1, url=$2, type=$3, tags=$4, review=$5, rating=$6,
     location_name=$7, lat=$8, lng=$9, incident_id=$10, updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [req.body.title, req.body.url, req.body.type, tags, req.body.review,
     req.body.rating != null && req.body.rating !== '' ? parseInt(req.body.rating) : null,
     req.body.location_name || null,
     req.body.lat ? parseFloat(req.body.lat) : null,
     req.body.lng ? parseFloat(req.body.lng) : null,
     req.body.incident_id || null,
     req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(normalizeEntry(result.rows[0]));
});

app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM entries WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/export', requireAuth, async (req, res) => {
  const incidentsRes = await pool.query('SELECT * FROM incidents ORDER BY created_at ASC');
  const entriesRes = await pool.query('SELECT * FROM entries ORDER BY created_at ASC');
  const data = {
    incidents: incidentsRes.rows.map(normalizeIncident),
    entries: entriesRes.rows.map(normalizeEntry)
  };
  const filename = `partenza-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

app.post('/api/import', requireAuth, express.json({ limit: '10mb' }), async (req, res) => {
  const body = req.body;
  const entriesArray = Array.isArray(body) ? body : (body.entries || []);
  const incidentsArray = Array.isArray(body) ? [] : (body.incidents || []);

  if (!Array.isArray(entriesArray)) return res.status(400).json({ error: 'Invalid format' });

  let inserted = 0;
  let skipped = 0;

  for (const incident of incidentsArray) {
    if (!incident.title || !incident.slug) { skipped++; continue; }
    const id = incident.id || uuidv4();
    const tags = Array.isArray(incident.tags) ? incident.tags : parseTags(incident.tags);
    const result = await pool.query(
      `INSERT INTO incidents (id, slug, title, description, date, location_name, lat, lng, tags, is_fictional, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [id, incident.slug, incident.title, incident.description || null, incident.date || null,
       incident.location_name || null,
       incident.lat ? parseFloat(incident.lat) : null,
       incident.lng ? parseFloat(incident.lng) : null,
       tags, incident.is_fictional === true, incident.createdAt || new Date(), incident.updatedAt || new Date()]
    );
    if (result.rowCount > 0) inserted++; else skipped++;
  }

  for (const entry of entriesArray) {
    if (!entry.title || !entry.url || !entry.type) { skipped++; continue; }
    const id = entry.id || uuidv4();
    const tags = Array.isArray(entry.tags) ? entry.tags : parseTags(entry.tags);
    const result = await pool.query(
      `INSERT INTO entries (id, title, url, type, tags, review, rating, location_name, lat, lng, incident_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [id, entry.title, entry.url, entry.type, tags, entry.review || '',
       entry.rating != null && entry.rating !== '' ? parseInt(entry.rating) : null,
       entry.location_name || null,
       entry.lat ? parseFloat(entry.lat) : null,
       entry.lng ? parseFloat(entry.lng) : null,
       entry.incident_id || null,
       entry.createdAt || new Date(), entry.updatedAt || new Date()]
    );
    if (result.rowCount > 0) inserted++; else skipped++;
  }

  res.json({ ok: true, inserted, skipped });
});

app.put('/api/config', requireAuth, async (req, res) => {
  if (req.body.siteTitle) await setConfig('siteTitle', req.body.siteTitle);
  if (req.body.siteTagline) await setConfig('siteTagline', req.body.siteTagline);
  res.json({ ok: true });
});

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
    rating: row.rating != null ? parseInt(row.rating) : null,
    location_name: row.location_name || null,
    lat: row.lat != null ? parseFloat(row.lat) : null,
    lng: row.lng != null ? parseFloat(row.lng) : null,
    incident_id: row.incident_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeIncident(row) {
  const obj = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || null,
    date: row.date || null,
    location_name: row.location_name || null,
    lat: row.lat != null ? parseFloat(row.lat) : null,
    lng: row.lng != null ? parseFloat(row.lng) : null,
    tags: row.tags || [],
    image_url: row.image_url || null,
    is_fictional: row.is_fictional === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.entry_count != null) obj.entry_count = parseInt(row.entry_count);
  if (row.entry_types != null) obj.entry_types = row.entry_types;
  return obj;
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`The Partenza Files running at http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
