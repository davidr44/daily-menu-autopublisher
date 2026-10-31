import { pinCorreto, validarEmenta, json, lerJson } from './_lib.mjs';

// POST /api/publicar → { pin, local, sopas, pratos }
// Confirma o PIN, valida a ementa e só então a envia para o Make (mesmo formato de sempre).
export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);

  const body = await lerJson(req);
  if (!pinCorreto(body?.pin)) return json({ ok: false, erro: 'pin' }, 401);

  const ementa = validarEmenta(body);
  if (!ementa) return json({ ok: false, erro: 'ementa' }, 400);

  const destino = process.env.MAKE_WEBHOOK_URL;
  if (!destino) return json({ ok: false, erro: 'configuracao' }, 500);

  try {
    const headers = { 'content-type': 'application/json' };
    // O webhook do Make só aceita pedidos com esta chave; sem ela, o endereço sozinho não serve de nada
    if (process.env.MAKE_API_KEY) headers['x-make-apikey'] = process.env.MAKE_API_KEY;
    const r = await fetch(destino, {
      method: 'POST',
      headers,
      body: JSON.stringify(ementa),
    });
    if (!r.ok) return json({ ok: false, erro: 'make' }, 502);
    return json({ ok: true });
  } catch {
    return json({ ok: false, erro: 'make' }, 502);
  }
};

export const config = { path: '/api/publicar' };
