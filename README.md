# The Partenza Files

A curated archive of media about accidents and disasters.

## Running locally

```bash
npm install
node server.js
```

Open http://localhost:3000

## First-time setup

1. Go to `/admin.html`
2. You'll be prompted to set a password (first run only)
3. Start adding entries

## Deploying

This is a Node.js/Express app. Deploy to any platform that supports Node.js:

- **Railway / Render / Fly.io**: Connect repo, set start command to `node server.js`
- **VPS**: Clone repo, `npm install`, run with `pm2 start server.js`

Set the `SESSION_SECRET` environment variable to a long random string in production.

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `SESSION_SECRET` | `partenza-secret-change-me` | **Change this in production** |
