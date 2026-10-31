// Local server for development and tests: serves app/, runs the real Netlify Functions
// under /api/* and fakes the Make webhook at /__make (it records what it receives).
// PINs and webhook here are test values, never the production ones.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../app/', import.meta.url));
const port = Number(process.env.PORT || 4173);
process.env.PINS ??= '1234,5678';
process.env.MAKE_WEBHOOK_URL ??= `http://127.0.0.1:${port}/__make`;

const { default: pin } = await import('../netlify/functions/pin.mjs');
const { default: publicar } = await import('../netlify/functions/publicar.mjs');

const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const received = [];
let makeFails = false;

async function readBody(req) {
  const chunks = [];
  for await (const p of req) chunks.push(p);
  return Buffer.concat(chunks);
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : undefined;

    if (url.pathname === '/api/pin' || url.pathname === '/api/publicar') {
      const request = new Request(url, { method: req.method, headers: req.headers, body: body });
      return send(res, await (url.pathname === '/api/pin' ? pin : publicar)(request));
    }
    if (url.pathname === '/__make') {
      if (req.method === 'POST') {
        if (makeFails) { res.writeHead(500); return res.end(); }
        received.push(JSON.parse(body.toString()));
        res.writeHead(200); return res.end('Accepted');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(received));
    }
    if (url.pathname === '/__make/fail') { makeFails = url.searchParams.get('v') === '1'; res.writeHead(204); return res.end(); }
    if (url.pathname === '/__make/reset') { received.length = 0; makeFails = false; res.writeHead(204); return res.end(); }

    const filePath = normalize(join(root, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!filePath.startsWith(root)) { res.writeHead(403); return res.end(); }
    try {
      const file = await readFile(filePath);
      res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
      res.end(file);
    } catch {
      res.writeHead(404); res.end();
    }
  })
  .listen(port, () => console.log(`App at http://127.0.0.1:${port}`));
