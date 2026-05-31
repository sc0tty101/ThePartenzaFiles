const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data', 'entries.json');
const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'partenza-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

function readEntries() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2));
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Public: get all entries (sorted newest first)
app.get('/api/entries', (req, res) => {
  const entries = readEntries();
  const sorted = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sorted);
});

// Public: get site config (title, tagline only)
app.get('/api/config', (req, res) => {
  const { siteTitle, siteTagline } = readConfig();
  res.json({ siteTitle, siteTagline });
});

// Auth: login
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  const config = readConfig();
  const match = await bcrypt.compare(password, config.passwordHash);
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

// Admin: create entry
app.post('/api/entries', requireAuth, (req, res) => {
  const entries = readEntries();
  const entry = {
    id: uuidv4(),
    title: req.body.title,
    url: req.body.url,
    type: req.body.type, // video | article | book | podcast
    tags: Array.isArray(req.body.tags) ? req.body.tags : (req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
    review: req.body.review,
    rating: parseInt(req.body.rating) || 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  entries.push(entry);
  writeEntries(entries);
  res.json(entry);
});

// Admin: update entry
app.put('/api/entries/:id', requireAuth, (req, res) => {
  const entries = readEntries();
  const idx = entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  entries[idx] = {
    ...entries[idx],
    title: req.body.title,
    url: req.body.url,
    type: req.body.type,
    tags: Array.isArray(req.body.tags) ? req.body.tags : (req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
    review: req.body.review,
    rating: parseInt(req.body.rating) || 3,
    updatedAt: new Date().toISOString()
  };
  writeEntries(entries);
  res.json(entries[idx]);
});

// Admin: delete entry
app.delete('/api/entries/:id', requireAuth, (req, res) => {
  let entries = readEntries();
  entries = entries.filter(e => e.id !== req.params.id);
  writeEntries(entries);
  res.json({ ok: true });
});

// Admin: update site config
app.put('/api/config', requireAuth, (req, res) => {
  const config = readConfig();
  if (req.body.siteTitle) config.siteTitle = req.body.siteTitle;
  if (req.body.siteTagline) config.siteTagline = req.body.siteTagline;
  writeConfig(config);
  res.json({ ok: true });
});

// Admin: change password
app.post('/api/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const config = readConfig();
  config.passwordHash = await bcrypt.hash(newPassword, 10);
  writeConfig(config);
  res.json({ ok: true });
});

// Setup: hash initial password (only works if hash is placeholder)
app.post('/api/setup', async (req, res) => {
  const config = readConfig();
  if (config.passwordHash !== '$2b$10$placeholder') {
    return res.status(400).json({ error: 'Already set up' });
  }
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  config.passwordHash = await bcrypt.hash(password, 10);
  writeConfig(config);
  req.session.authenticated = true;
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`The Partenza Files running at http://localhost:${PORT}`);
});
