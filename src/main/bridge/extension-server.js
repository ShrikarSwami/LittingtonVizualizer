// A small HTTP server on this computer only (127.0.0.1). Two visitors:
//   POST /ytm               the companion Chrome extension reporting YouTube Music state
//   GET  /spotify-callback  the browser returning from Spotify's login page
const http = require('http');

const PORT = 38217;
const MAX_BODY = 256 * 1024;

function start({ onYtm, onSpotifyCallback }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    if (req.method === 'POST' && url.pathname === '/ytm') {
      // Only our extension's service worker may post; ordinary web pages can't forge this origin.
      if (!String(req.headers.origin || '').startsWith('chrome-extension://')) {
        res.writeHead(403).end();
        return;
      }
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) { res.writeHead(413).end(); req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        try { onYtm(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { /* ignore malformed reports */ }
        res.writeHead(204).end();
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/spotify-callback') {
      const page = (title, detail) => {
        const safe = (text) => String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>LittingtonVizualizer</title>
<body style="font:16px -apple-system,sans-serif;background:#0a0616;color:#eee;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1>${safe(title)}</h1><p style="opacity:.7">${safe(detail)}</p></div>`);
      };
      onSpotifyCallback(url.searchParams)
        .then(() => page('Spotify connected', 'You can close this tab and go back to LittingtonVizualizer.'))
        .catch((error) => page('Spotify login did not finish', error.message));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('LittingtonVizualizer');
      return;
    }
    res.writeHead(404).end();
  });

  server.on('error', (error) => console.error('[bridge]', error.message));
  server.listen(PORT, '127.0.0.1');
  return server;
}

module.exports = { start, PORT, spotifyRedirectUri: `http://127.0.0.1:${PORT}/spotify-callback` };
