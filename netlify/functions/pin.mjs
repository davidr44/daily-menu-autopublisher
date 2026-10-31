import { isValidPin, json, readJson } from './_lib.mjs';

// GET  /api/pin → only wakes the function when the app opens (avoids the cold-start wait)
// POST /api/pin → { pin } → 200 { ok: true } or 401 { ok: false }
export default async (req) => {
  if (req.method === 'GET') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json({ ok: false }, 405);
  const body = await readJson(req);
  const ok = isValidPin(body?.pin);
  return json({ ok }, ok ? 200 : 401);
};

export const config = { path: '/api/pin' };
