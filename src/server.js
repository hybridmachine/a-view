import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldStore } from './store.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = process.env.A_VIEW_DB || resolve(root, 'data/world.sqlite');
await mkdir(dirname(dataPath), { recursive: true });
const store = new WorldStore(dataPath);
const clients = new Set();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/api/world') {
      const snapshot = store.snapshot();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(snapshot)); return;
    }
    if (url.pathname === '/api/stream') {
      const snapshot = store.snapshot();
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    const isShared = url.pathname.startsWith('/shared/');
    const folder = resolve(root, isShared ? 'shared' : 'public');
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(isShared ? 8 : 1));
    const path = resolve(folder, relative);
    if (!path.startsWith(folder + sep)) { res.writeHead(403); res.end(); return; }
    const info = await stat(path);
    if (!info.isFile()) { res.writeHead(404); res.end(); return; }
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': path.includes('/assets/') ? 'public, max-age=86400' : 'no-cache', 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch(error) {
    if (error.code === 'WORLD_CATCHING_UP' && !res.headersSent) { res.writeHead(503, {'Retry-After': '2'}); res.end('World is catching up'); }
    else if (error.code === 'ENOENT' || error.code === 'ENOTDIR') { res.writeHead(404); res.end('Not found'); }
    else { console.error(error); if (!res.headersSent) res.writeHead(500); res.end('Unable to load this view.'); }
  }
});
const tick = setInterval(() => {
  try {
    const snapshot = store.snapshot();
    for (const client of clients) {
      if (client.writableLength > 1_000_000) { clients.delete(client); client.destroy(); continue; }
      client.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    }
  } catch(error) { console.error('World update failed:', error); }
}, 2000);
const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`A View is open at http://127.0.0.1:${server.address().port}`));
function shutdown() { clearInterval(tick); for (const client of clients) client.end(); server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
