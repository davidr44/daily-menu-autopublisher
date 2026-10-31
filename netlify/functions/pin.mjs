import { pinCorreto, json, lerJson } from './_lib.mjs';

// GET  /api/pin  → só "acorda" a função quando a app abre (evita a espera do arranque a frio)
// POST /api/pin  → { pin } → 200 { ok: true } ou 401 { ok: false }
export default async (req) => {
  if (req.method === 'GET') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json({ ok: false }, 405);
  const body = await lerJson(req);
  const ok = pinCorreto(body?.pin);
  return json({ ok }, ok ? 200 : 401);
};

export const config = { path: '/api/pin' };
