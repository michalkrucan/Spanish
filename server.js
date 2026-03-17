const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const BBC_RSS = 'https://feeds.bbci.co.uk/mundo/rss.xml';

// ── Fetch a URL server-side (no CORS) ────────────────────────
function fetch(targetUrl) {
  return new Promise(function(resolve, reject) {
    var parsed = url.parse(targetUrl);
    var lib = parsed.protocol === 'https:' ? https : http;
    var options = {
      hostname: parsed.hostname,
      path: parsed.path,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpanishLearner/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es,en;q=0.5',
      },
      timeout: 12000,
    };
    var req = lib.get(options, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect once
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      var data = [];
      res.on('data', function(chunk) { data.push(chunk); });
      res.on('end', function() { resolve({ status: res.statusCode, body: Buffer.concat(data).toString('utf8') }); });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Parse RSS XML into article list ──────────────────────────
function parseRSS(xml) {
  var items = [];
  var itemRegex = /<item>([\s\S]*?)<\/item>/g;
  var match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    var block = match[1];
    var title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                 block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    var desc  = (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                 block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
    var link  = (block.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/) ||
                 block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) ||
                 block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    desc = desc.replace(/<[^>]+>/g, '').trim();
    title = title.trim();
    link = link.trim();
    if (title && link) items.push({ title, desc, link });
  }
  return items;
}

// ── Extract article text from BBC Mundo HTML ─────────────────
function extractArticle(html) {
  // Remove script/style blocks
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');

  var paragraphs = [];

  // BBC Mundo uses data-component="text-block" for article paragraphs
  var blockRegex = /data-component="text-block"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
  var match;
  while ((match = blockRegex.exec(html)) !== null) {
    var text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 20) paragraphs.push(text);
  }

  // Fallback: grab all <p> inside <article>
  if (paragraphs.length < 3) {
    paragraphs = [];
    var articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
    var scope = articleMatch ? articleMatch[0] : html;
    var pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
    while ((match = pRegex.exec(scope)) !== null) {
      var text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 40) paragraphs.push(text);
    }
  }

  // Extract title
  var titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  return { title, paragraphs };
}

// ── CORS headers ──────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

// ── Routes ────────────────────────────────────────────────────
var server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var path = parsed.pathname;

  // GET /feed — returns 5 BBC Mundo headlines
  if (path === '/feed') {
    cors(res);
    fetch(BBC_RSS)
      .then(function(r) {
        if (r.status !== 200) throw new Error('RSS status ' + r.status);
        var articles = parseRSS(r.body);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, articles }));
      })
      .catch(function(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });
    return;
  }

  // GET /article?url=... — fetches and extracts article text
  if (path === '/article') {
    var articleUrl = parsed.query.url;
    if (!articleUrl || !articleUrl.startsWith('http')) {
      cors(res);
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'Missing url param' }));
      return;
    }
    cors(res);
    fetch(articleUrl)
      .then(function(r) {
        if (r.status !== 200) throw new Error('Page status ' + r.status);
        var result = extractArticle(r.body);
        if (result.paragraphs.length === 0) throw new Error('No paragraphs found');
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, title: result.title, paragraphs: result.paragraphs }));
      })
      .catch(function(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });
    return;
  }

  // Serve the app HTML
  if (path === '/' || path === '/index.html') {
    var fs = require('fs');
    fs.readFile(__dirname + '/app.html', function(err, data) {
      if (err) { res.writeHead(404); res.end('app.html not found'); return; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, function() {
  console.log('España Express server running on port ' + PORT);
  console.log('  GET /       → app');
  console.log('  GET /feed   → BBC Mundo headlines');
  console.log('  GET /article?url=... → article text');
});
