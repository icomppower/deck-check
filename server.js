// Local dev server, zero dependencies: serves index.html and POST /api/run on localhost only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import handler from './api/run.js';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/run') return handler(req, res);
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end(await readFile(join(root, 'index.html')));
  }
  res.statusCode = 404;
  res.end('Not found');
}).listen(port, '127.0.0.1', () => console.log(`Deck Check on http://localhost:${port}`));
