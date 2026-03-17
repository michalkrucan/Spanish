# España Express — Server Setup

## Local development
```bash
npm start
# App runs at http://localhost:3000
```

## Deploy to Railway (free)
1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Select the repo — Railway auto-detects Node.js and runs `npm start`
4. Done. You get a public URL like `https://espana-express.up.railway.app`

## Deploy to Render (free tier)
1. Push to GitHub
2. render.com → New Web Service → Connect repo
3. Build command: (leave empty)
4. Start command: `node server.js`
5. Done.

## API endpoints
- `GET /` — serves the app
- `GET /feed` — returns 5 latest BBC Mundo articles as JSON
- `GET /article?url=https://...` — fetches and extracts article text as JSON

## File structure
```
espana-express/
  server.js    ← Node.js backend (no dependencies, pure stdlib)
  app.html     ← The Spanish learning app (copy from claude output)
  package.json
  README.md
```

## After deploying
Update the API_BASE constant in app.html:
```js
var API_BASE = 'https://your-app.up.railway.app';
```
