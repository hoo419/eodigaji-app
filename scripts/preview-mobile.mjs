import http from 'node:http';
import { readFile } from 'node:fs/promises';
const allowed = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
http.createServer(async (req, res) => {
  const asset = allowed[new URL(req.url, 'http://localhost').pathname];
  if (!asset) { res.writeHead(404); return res.end('No API server in the packaged mobile preview.'); }
  try { const data = await readFile(new URL(`../dist-mobile/${asset[0]}`, import.meta.url)); res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(data); }
  catch { res.writeHead(404); res.end('Run npm run build:mobile first.'); }
}).listen(4174, '127.0.0.1', () => console.log('Packaged Android UI preview: http://127.0.0.1:4174 (no API endpoints)'));
