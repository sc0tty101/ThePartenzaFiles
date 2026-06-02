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
      ('siteTagline', 'A curated archive of accidents, disasters, and the stories they leave behind.')
    ON CONFLICT (key) DO NOTHING;
  `);

  await pool.query(`
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS location_name TEXT;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS image_url TEXT;
  `);

  await seedData();
}

async function seedData() {
  const { rows } = await pool.query('SELECT COUNT(*) FROM entries');
  if (parseInt(rows[0].count) > 0) return;

  const incidents = [
    {
      title: 'Space Shuttle Challenger Disaster',
      description: "On January 28, 1986, the Space Shuttle Challenger broke apart 73 seconds into its flight, killing all seven crew members. The disaster was caused by the failure of O-ring seals in a solid rocket booster, exacerbated by unusually cold temperatures at launch. Subsequent investigation revealed deep institutional failures at NASA, including suppression of engineers' safety concerns.",
      date: 'January 28, 1986',
      location_name: 'Kennedy Space Center, Florida, USA',
      lat: 28.5729, lng: -80.6490,
      tags: ['space', 'nasa', 'challenger', 'engineering'],
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Challenger_explosion.jpg/1280px-Challenger_explosion.jpg'
    },
    {
      title: 'Überlingen Mid-Air Collision',
      description: "On July 1, 2002, a Bashkirian Airlines Tupolev Tu-154 and a DHL Boeing 757 collided over Überlingen, Germany, killing all 71 people aboard both aircraft. The collision occurred because conflicting instructions were given by an automated collision-avoidance system and a human air traffic controller. The tragedy had a devastating postscript: the controller was murdered by a bereaved father two years later.",
      date: 'July 1, 2002',
      location_name: 'Überlingen, Germany',
      lat: 47.7606, lng: 9.1611,
      tags: ['aviation', 'atc', 'collision', 'europe'],
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Tupolev_Tu-154_Bashkirian_Airlines.jpg/1280px-Tupolev_Tu-154_Bashkirian_Airlines.jpg'
    },
    {
      title: 'Three Mile Island Accident',
      description: "On March 28, 1979, the Three Mile Island Unit 2 nuclear power plant in Pennsylvania suffered a partial meltdown — the most serious nuclear accident in U.S. history. A combination of equipment failures, design problems, and operator errors led to a loss of coolant and significant fuel damage. The accident transformed public perception of nuclear power and prompted major changes in regulation and emergency response planning.",
      date: 'March 28, 1979',
      location_name: 'Three Mile Island, Pennsylvania, USA',
      lat: 40.1533, lng: -76.7252,
      tags: ['systems', 'theory', 'nuclear', 'engineering'],
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Three_Mile_Island_2_-_just_before_the_cooling_towers_were_demolished.jpg/1280px-Three_Mile_Island_2_-_just_before_the_cooling_towers_were_demolished.jpg'
    },
    {
      title: 'Demolition of Pruitt-Igoe',
      description: "The Pruitt-Igoe housing project in St. Louis, Missouri, was demolished between 1972 and 1976 after years of social and structural decline. Built in 1954 as a modernist utopian experiment in public housing, it became a symbol — often unfairly — of the failure of large-scale urban planning. The real story involves deliberate underfunding, racial segregation, and political abandonment rather than architectural failure.",
      date: '1972–1976',
      location_name: 'St. Louis, Missouri, USA',
      lat: 38.6270, lng: -90.1994,
      tags: ['architecture', 'housing', 'urban', 'collapse'],
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Pruitt-igoe_collapse-series.jpg/1280px-Pruitt-igoe_collapse-series.jpg'
    },
    {
      title: 'Fukushima Daiichi Nuclear Disaster',
      description: "On March 11, 2011, a magnitude 9.0 earthquake and subsequent tsunami triggered a nuclear disaster at the Fukushima Daiichi power plant in Japan, causing three reactor meltdowns. It was the most severe nuclear accident since Chernobyl. Japan's National Diet investigation concluded the disaster was 'profoundly manmade,' citing regulatory capture, cultural deference to authority, and inadequate emergency preparation.",
      date: 'March 11, 2011',
      location_name: 'Fukushima Daiichi, Japan',
      lat: 37.4215, lng: 141.0329,
      tags: ['nuclear', 'japan', 'fukushima', 'tsunami'],
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Fukushima_I_by_Digital_Globe.jpg/1280px-Fukushima_I_by_Digital_Globe.jpg'
    },
    {
      title: 'BP Texas City Refinery Explosion',
      description: "On March 23, 2005, an explosion at BP's Texas City refinery killed 15 workers and injured 180 others. The blast originated in a raffinate splitter tower that had been overfilled during a restart, and was the deadliest U.S. industrial accident in over a decade. Investigations found a pattern of safety culture failures, budget cuts, and normalised deviations that created the conditions for disaster.",
      date: 'March 23, 2005',
      location_name: 'Texas City, Texas, USA',
      lat: 29.3838, lng: -94.9027,
      tags: ['industrial', 'explosion', 'bp', 'texas'],
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Texas_City_Refinery_explosion.jpg/1280px-Texas_City_Refinery_explosion.jpg'
    },
    {
      title: 'Flint Water Crisis',
      description: "Between 2014 and 2019, residents of Flint, Michigan, were exposed to dangerously high levels of lead in their drinking water after the city switched its water supply source to the Flint River without implementing adequate corrosion controls. The crisis exposed deep failures in public health infrastructure, environmental regulation, and the treatment of low-income communities of colour by government at all levels.",
      date: '2014–2019',
      location_name: 'Flint, Michigan, USA',
      lat: 43.0125, lng: -83.6875,
      tags: ['water', 'flint', 'infrastructure', 'public-health'],
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Flint_Water_Crisis_2016.jpg/1280px-Flint_Water_Crisis_2016.jpg'
    },
    {
      title: 'Ramstein Airshow Disaster',
      description: "On August 28, 1988, three jets of the Italian Air Force aerobatic team Frecce Tricolori collided during a display at Ramstein Air Base in West Germany. The collision sent a fireball into the crowd, killing 70 spectators and injuring nearly 350 more. Despite being one of the deadliest airshow accidents in history, it prompted surprisingly little change in international airshow safety regulations.",
      date: 'August 28, 1988',
      location_name: 'Ramstein Air Base, Germany',
      lat: 49.4369, lng: 7.6003,
      tags: ['aviation', 'airshow', 'germany', 'military'],
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Ramstein_airshow_disaster.jpg/1280px-Ramstein_airshow_disaster.jpg'
    }
  ];

  const entries = [
    {
      title: "The Challenger Disaster — Richard Feynman's Investigation",
      url: 'https://www.youtube.com/watch?v=6Rwcbsn19c0',
      type: 'video',
      tags: ['space', 'nasa', 'challenger', 'engineering'],
      review: "Feynman's famous O-ring demonstration before the Rogers Commission is one of the most quietly devastating moments in the history of public accountability. A physicist drops a rubber ring in ice water and unravels years of institutional cover. Essential.",
      rating: 5,
      location_name: 'Kennedy Space Center, Florida, USA',
      lat: 28.5729, lng: -80.6490,
      incidentSlug: 'space-shuttle-challenger-disaster'
    },
    {
      title: 'Mayday: Air Crash Investigation — Überlingen Mid-Air Collision',
      url: 'https://www.youtube.com/watch?v=oHyWFP0SYIE',
      type: 'video',
      tags: ['aviation', 'atc', 'collision', 'europe'],
      review: 'Two aircraft collide over Germany in 2002 because of conflicting instructions from an automated system and a controller. The episode covers the crash but also the devastating aftermath — including the murder of the controller by a grieving father. Hard to watch, impossible to look away.',
      rating: 4,
      location_name: 'Überlingen, Germany',
      lat: 47.7606, lng: 9.1611,
      incidentSlug: 'uberlingen-mid-air-collision'
    },
    {
      title: 'Normal Accidents: Living with High-Risk Technologies — Charles Perrow',
      url: 'https://www.amazon.com/Normal-Accidents-Living-High-Risk-Technologies/dp/0691004129',
      type: 'book',
      tags: ['systems', 'theory', 'nuclear', 'engineering'],
      review: "Perrow's argument is simple and unsettling: in tightly coupled, complex systems, catastrophic accidents aren't failures — they're normal. Written after Three Mile Island, it holds up uncomfortably well. Dense but worth it if you want to understand why disasters keep happening despite our best efforts.",
      rating: 5,
      location_name: 'Three Mile Island, Pennsylvania, USA',
      lat: 40.1533, lng: -76.7252,
      incidentSlug: 'three-mile-island-accident'
    },
    {
      title: '99% Invisible — The Pruitt-Igoe Myth',
      url: 'https://99percentinvisible.org/episode/the-pruitt-igoe-myth/',
      type: 'podcast',
      tags: ['architecture', 'housing', 'urban', 'collapse'],
      review: "The demolition of the Pruitt-Igoe housing project in St. Louis became shorthand for the failure of modernist architecture. This episode complicates that story considerably — the buildings weren't the problem. A good listen for anyone interested in how we assign blame after things fail.",
      rating: 4,
      location_name: 'St. Louis, Missouri, USA',
      lat: 38.6270, lng: -90.1994,
      incidentSlug: 'demolition-of-pruitt-igoe'
    },
    {
      title: 'The Fukushima Daiichi Nuclear Disaster — Official NAIIC Report Summary',
      url: 'https://www.nirs.org/wp-content/uploads/fukushima/naiic_report.pdf',
      type: 'article',
      tags: ['nuclear', 'japan', 'fukushima', 'tsunami'],
      review: "The National Diet's official investigation concluded the disaster was \"profoundly manmade.\" The executive summary alone is worth reading — unusually frank for a government document, it names the cultural and regulatory failures directly. The first 20 pages tell you everything.",
      rating: 5,
      location_name: 'Fukushima Daiichi, Japan',
      lat: 37.4215, lng: 141.0329,
      incidentSlug: 'fukushima-daiichi-nuclear-disaster'
    },
    {
      title: 'Seconds from Disaster — Texas City Refinery Explosion',
      url: 'https://www.youtube.com/watch?v=XuPLkrJeN8I',
      type: 'video',
      tags: ['industrial', 'explosion', 'bp', 'texas'],
      review: 'The 2005 BP Texas City disaster killed 15 people and injured 180. This reconstruction shows how a series of normalised deviations — each individually survivable — combined into catastrophe. Good on the human factors side, though it underplays the corporate cost-cutting context.',
      rating: 3,
      location_name: 'Texas City, Texas, USA',
      lat: 29.3838, lng: -94.9027,
      incidentSlug: 'bp-texas-city-refinery-explosion'
    },
    {
      title: "How Flint's Water Crisis Happened — FiveThirtyEight",
      url: 'https://fivethirtyeight.com/features/how-flints-water-crisis-happened/',
      type: 'article',
      tags: ['water', 'flint', 'infrastructure', 'public-health'],
      review: "Data-driven reconstruction of how Flint's water supply became contaminated with lead. Clear on the sequence of decisions and the bureaucratic gaps that allowed it to continue. Good as a primer before going deeper into longer-form coverage.",
      rating: 3,
      location_name: 'Flint, Michigan, USA',
      lat: 43.0125, lng: -83.6875,
      incidentSlug: 'flint-water-crisis'
    },
    {
      title: 'The Ramstein Airshow Disaster — Der Spiegel',
      url: 'https://www.spiegel.de/international/germany/revisiting-ramstein-a-look-back-at-the-1988-air-show-disaster-a-573165.html',
      type: 'article',
      tags: ['aviation', 'airshow', 'germany', 'military'],
      review: 'The 1988 Ramstein airshow crash killed 70 people when an aerobatic display went wrong over a packed crowd. Largely forgotten outside Germany. This piece revisits it with survivor testimony and asks why so little changed about airshow safety in the aftermath.',
      rating: 4,
      location_name: 'Ramstein Air Base, Germany',
      lat: 49.4369, lng: 7.6003,
      incidentSlug: 'ramstein-airshow-disaster'
    }
  ];

  const incidentIdBySlug = {};

  for (const incident of incidents) {
    const slug = slugify(incident.title);
    const id = uuidv4();
    incidentIdBySlug[slug] = id;
    await pool.query(
      `INSERT INTO incidents (id, slug, title, description, date, location_name, lat, lng, tags, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, slug, incident.title, incident.description, incident.date,
       incident.location_name || null, incident.lat || null, incident.lng || null,
       incident.tags, incident.image_url || null]
    );
  }

  for (const entry of entries) {
    const incidentId = incidentIdBySlug[entry.incidentSlug] || null;
    await pool.query(
      `INSERT INTO entries (id, title, url, type, tags, review, rating, location_name, lat, lng, incident_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [uuidv4(), entry.title, entry.url, entry.type, entry.tags, entry.review, entry.rating,
       entry.location_name || null, entry.lat || null, entry.lng || null, incidentId]
    );
  }
  console.log(`Seeded ${incidents.length} incidents and ${entries.length} entries.`);
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
    `INSERT INTO incidents (id, slug, title, description, date, location_name, lat, lng, tags, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [uuidv4(), slug, req.body.title, req.body.description || null, req.body.date || null,
     req.body.location_name || null,
     req.body.lat ? parseFloat(req.body.lat) : null,
     req.body.lng ? parseFloat(req.body.lng) : null,
     tags, req.body.image_url || null]
  );
  res.json(normalizeIncident(result.rows[0]));
});

app.put('/api/incidents/:id', requireAuth, async (req, res) => {
  const tags = parseTags(req.body.tags);
  const slug = req.body.slug || slugify(req.body.title);
  const result = await pool.query(
    `UPDATE incidents SET slug=$1, title=$2, description=$3, date=$4, location_name=$5,
     lat=$6, lng=$7, tags=$8, image_url=$9, updated_at=NOW()
     WHERE id=$10 RETURNING *`,
    [slug, req.body.title, req.body.description || null, req.body.date || null,
     req.body.location_name || null,
     req.body.lat ? parseFloat(req.body.lat) : null,
     req.body.lng ? parseFloat(req.body.lng) : null,
     tags, req.body.image_url || null, req.params.id]
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
     parseInt(req.body.rating) || 3,
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
     parseInt(req.body.rating) || 3,
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
    await pool.query(
      `INSERT INTO incidents (id, slug, title, description, date, location_name, lat, lng, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [id, incident.slug, incident.title, incident.description || null, incident.date || null,
       incident.location_name || null,
       incident.lat ? parseFloat(incident.lat) : null,
       incident.lng ? parseFloat(incident.lng) : null,
       tags, incident.createdAt || new Date(), incident.updatedAt || new Date()]
    );
    inserted++;
  }

  for (const entry of entriesArray) {
    if (!entry.title || !entry.url || !entry.type) { skipped++; continue; }
    const id = entry.id || uuidv4();
    const tags = Array.isArray(entry.tags) ? entry.tags : parseTags(entry.tags);
    await pool.query(
      `INSERT INTO entries (id, title, url, type, tags, review, rating, location_name, lat, lng, incident_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [id, entry.title, entry.url, entry.type, tags, entry.review || '', parseInt(entry.rating) || 3,
       entry.location_name || null,
       entry.lat ? parseFloat(entry.lat) : null,
       entry.lng ? parseFloat(entry.lng) : null,
       entry.incident_id || null,
       entry.createdAt || new Date(), entry.updatedAt || new Date()]
    );
    inserted++;
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
    rating: row.rating,
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
