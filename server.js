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
      ('siteTagline', 'A curated archive of accidents, disasters, and the stories they leave behind.')
    ON CONFLICT (key) DO NOTHING;
  `);
  // Add location columns to existing tables that predate this migration
  await pool.query(`
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS location_name TEXT;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
  `);
  await seedEntries();
}

async function seedEntries() {
  const { rows } = await pool.query('SELECT COUNT(*) FROM entries');
  if (parseInt(rows[0].count) > 0) return;

  const entries = [
    {
      title: "The Challenger Disaster — Richard Feynman's Investigation",
      url: 'https://www.youtube.com/watch?v=6Rwcbsn19c0',
      type: 'video',
      tags: ['space', 'nasa', 'challenger', 'engineering'],
      review: "Feynman's famous O-ring demonstration before the Rogers Commission is one of the most quietly devastating moments in the history of public accountability. A physicist drops a rubber ring in ice water and unravels years of institutional cover. Essential.",
      rating: 5,
      location_name: 'Kennedy Space Center, Florida, USA',
      lat: 28.5729, lng: -80.6490
    },
    {
      title: 'Mayday: Air Crash Investigation — Überlingen Mid-Air Collision',
      url: 'https://www.youtube.com/watch?v=oHyWFP0SYIE',
      type: 'video',
      tags: ['aviation', 'atc', 'collision', 'europe'],
      review: 'Two aircraft collide over Germany in 2002 because of conflicting instructions from an automated system and a controller. The episode covers the crash but also the devastating aftermath — including the murder of the controller by a grieving father. Hard to watch, impossible to look away.',
      rating: 4,
      location_name: 'Überlingen, Germany',
      lat: 47.7606, lng: 9.1611
    },
    {
      title: 'Normal Accidents: Living with High-Risk Technologies — Charles Perrow',
      url: 'https://www.amazon.com/Normal-Accidents-Living-High-Risk-Technologies/dp/0691004129',
      type: 'book',
      tags: ['systems', 'theory', 'nuclear', 'engineering'],
      review: "Perrow's argument is simple and unsettling: in tightly coupled, complex systems, catastrophic accidents aren't failures — they're normal. Written after Three Mile Island, it holds up uncomfortably well. Dense but worth it if you want to understand why disasters keep happening despite our best efforts.",
      rating: 5,
      location_name: 'Three Mile Island, Pennsylvania, USA',
      lat: 40.1533, lng: -76.7252
    },
    {
      title: '99% Invisible — The Pruitt-Igoe Myth',
      url: 'https://99percentinvisible.org/episode/the-pruitt-igoe-myth/',
      type: 'podcast',
      tags: ['architecture', 'housing', 'urban', 'collapse'],
      review: "The demolition of the Pruitt-Igoe housing project in St. Louis became shorthand for the failure of modernist architecture. This episode complicates that story considerably — the buildings weren't the problem. A good listen for anyone interested in how we assign blame after things fail.",
      rating: 4,
      location_name: 'St. Louis, Missouri, USA',
      lat: 38.6270, lng: -90.1994
    },
    {
      title: 'The Fukushima Daiichi Nuclear Disaster — Official NAIIC Report Summary',
      url: 'https://www.nirs.org/wp-content/uploads/fukushima/naiic_report.pdf',
      type: 'article',
      tags: ['nuclear', 'japan', 'fukushima', 'tsunami'],
      review: "The National Diet's official investigation concluded the disaster was \"profoundly manmade.\" The executive summary alone is worth reading — unusually frank for a government document, it names the cultural and regulatory failures directly. The first 20 pages tell you everything.",
      rating: 5,
      location_name: 'Fukushima Daiichi, Japan',
      lat: 37.4215, lng: 141.0329
    },
    {
      title: 'Seconds from Disaster — Texas City Refinery Explosion',
      url: 'https://www.youtube.com/watch?v=XuPLkrJeN8I',
      type: 'video',
      tags: ['industrial', 'explosion', 'bp', 'texas'],
      review: 'The 2005 BP Texas City disaster killed 15 people and injured 180. This reconstruction shows how a series of normalised deviations — each individually survivable — combined into catastrophe. Good on the human factors side, though it underplays the corporate cost-cutting context.',
      rating: 3,
      location_name: 'Texas City, Texas, USA',
      lat: 29.3838, lng: -94.9027
    },
    {
      title: "How Flint's Water Crisis Happened — FiveThirtyEight",
      url: 'https://fivethirtyeight.com/features/how-flints-water-crisis-happened/',
      type: 'article',
      tags: ['water', 'flint', 'infrastructure', 'public-health'],
      review: "Data-driven reconstruction of how Flint's water supply became contaminated with lead. Clear on the sequence of decisions and the bureaucratic gaps that allowed it to continue. Good as a primer before going deeper into longer-form coverage.",
      rating: 3,
      location_name: 'Flint, Michigan, USA',
      lat: 43.0125, lng: -83.6875
    },
    {
      title: 'The Ramstein Airshow Disaster — Der Spiegel',
      url: 'https://www.spiegel.de/international/germany/revisiting-ramstein-a-look-back-at-the-1988-air-show-disaster-a-573165.html',
      type: 'article',
      tags: ['aviation', 'airshow', 'germany', 'military'],
      review: 'The 1988 Ramstein airshow crash killed 70 people when an aerobatic display went wrong over a packed crowd. Largely forgotten outside Germany. This piece revisits it with survivor testimony and asks why so little changed about airshow safety in the aftermath.',
      rating: 4,
      location_name: 'Ramstein Air Base, Germany',
      lat: 49.4369, lng: 7.6003
    }
  ];

  for (const entry of entries) {
    await pool.query(
      `INSERT INTO entries (id, title, url, type, tags, review, rating, location_name, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [uuidv4(), entry.title, entry.url, entry.type, entry.tags, entry.review, entry.rating,
       entry.location_name || null, entry.lat || null, entry.lng || null]
    );
  }
  console.log(`Seeded ${entries.length} test entries.`);
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
    `INSERT INTO entries (id, title, url, type, tags, review, rating, location_name, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [uuidv4(), req.body.title, req.body.url, req.body.type, tags, req.body.review,
     parseInt(req.body.rating) || 3,
     req.body.location_name || null,
     req.body.lat ? parseFloat(req.body.lat) : null,
     req.body.lng ? parseFloat(req.body.lng) : null]
  );
  res.json(normalizeEntry(result.rows[0]));
});

// Admin: update entry
app.put('/api/entries/:id', requireAuth, async (req, res) => {
  const tags = parseTags(req.body.tags);
  const result = await pool.query(
    `UPDATE entries SET title=$1, url=$2, type=$3, tags=$4, review=$5, rating=$6,
     location_name=$7, lat=$8, lng=$9, updated_at=NOW()
     WHERE id=$10 RETURNING *`,
    [req.body.title, req.body.url, req.body.type, tags, req.body.review,
     parseInt(req.body.rating) || 3,
     req.body.location_name || null,
     req.body.lat ? parseFloat(req.body.lat) : null,
     req.body.lng ? parseFloat(req.body.lng) : null,
     req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(normalizeEntry(result.rows[0]));
});

// Admin: delete entry
app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM entries WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Admin: export all entries as JSON download
app.get('/api/export', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM entries ORDER BY created_at ASC');
  const data = JSON.stringify(result.rows.map(normalizeEntry), null, 2);
  const filename = `partenza-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(data);
});

// Admin: import entries from JSON
app.post('/api/import', requireAuth, express.json({ limit: '10mb' }), async (req, res) => {
  const entries = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'Expected a JSON array of entries' });

  let inserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.title || !entry.url || !entry.type) { skipped++; continue; }
    const id = entry.id || uuidv4();
    const tags = Array.isArray(entry.tags) ? entry.tags : parseTags(entry.tags);
    await pool.query(
      `INSERT INTO entries (id, title, url, type, tags, review, rating, location_name, lat, lng, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [id, entry.title, entry.url, entry.type, tags, entry.review || '', parseInt(entry.rating) || 3,
       entry.location_name || null,
       entry.lat ? parseFloat(entry.lat) : null,
       entry.lng ? parseFloat(entry.lng) : null,
       entry.createdAt || new Date(), entry.updatedAt || new Date()]
    );
    inserted++;
  }

  res.json({ ok: true, inserted, skipped });
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
    location_name: row.location_name || null,
    lat: row.lat != null ? parseFloat(row.lat) : null,
    lng: row.lng != null ? parseFloat(row.lng) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`The Partenza Files running at http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
