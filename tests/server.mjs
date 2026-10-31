// Servidor local para desenvolver e testar: serve a pasta app/, corre as funções reais do
// Netlify em /api/* e imita o webhook do Make em /__make (guarda o que recebeu).
// PINs e webhook aqui são valores de teste, nunca os de produção.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../app/', import.meta.url));
const porta = Number(process.env.PORT || 4173);
process.env.PINS ??= '1234,5678';
process.env.MAKE_WEBHOOK_URL ??= `http://127.0.0.1:${porta}/__make`;

const { default: pin } = await import('../netlify/functions/pin.mjs');
const { default: publicar } = await import('../netlify/functions/publicar.mjs');

const tipos = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const recebidas = [];
let makeFalha = false;

async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes);
}

async function responder(res, resposta) {
  res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const corpo = ['POST', 'PUT'].includes(req.method) ? await lerCorpo(req) : undefined;

    if (url.pathname === '/api/pin' || url.pathname === '/api/publicar') {
      const pedido = new Request(url, { method: req.method, headers: req.headers, body: corpo });
      return responder(res, await (url.pathname === '/api/pin' ? pin : publicar)(pedido));
    }
    if (url.pathname === '/__make') {
      if (req.method === 'POST') {
        if (makeFalha) { res.writeHead(500); return res.end(); }
        recebidas.push(JSON.parse(corpo.toString()));
        res.writeHead(200); return res.end('Accepted');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(recebidas));
    }
    if (url.pathname === '/__make/falhar') { makeFalha = url.searchParams.get('v') === '1'; res.writeHead(204); return res.end(); }
    if (url.pathname === '/__make/limpar') { recebidas.length = 0; makeFalha = false; res.writeHead(204); return res.end(); }

    const caminho = normalize(join(raiz, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!caminho.startsWith(raiz)) { res.writeHead(403); return res.end(); }
    try {
      const ficheiro = await readFile(caminho);
      res.writeHead(200, { 'content-type': tipos[extname(caminho)] || 'application/octet-stream' });
      res.end(ficheiro);
    } catch {
      res.writeHead(404); res.end();
    }
  })
  .listen(porta, () => console.log(`App em http://127.0.0.1:${porta}`));
