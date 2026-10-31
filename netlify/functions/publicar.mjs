import { isValidPin, validateMenu, json, readJson } from './_lib.mjs';

// POST /api/publicar → { pin, local, sopas, pratos }
// Checks the PIN, validates the menu and only then forwards it to Make (same payload as before).
export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);

  const body = await readJson(req);
  if (!isValidPin(body?.pin)) return json({ ok: false, error: 'pin' }, 401);

  const menu = validateMenu(body);
  if (!menu) return json({ ok: false, error: 'invalid_menu' }, 400);

  const target = process.env.MAKE_WEBHOOK_URL;
  if (!target) return json({ ok: false, error: 'not_configured' }, 500);

  const headers = { 'content-type': 'application/json' };
  // The Make webhook rejects requests without this key, so the URL alone is useless
  if (process.env.MAKE_API_KEY) headers['x-make-apikey'] = process.env.MAKE_API_KEY;

  try {
    const r = await fetch(target, { method: 'POST', headers, body: JSON.stringify(menu) });
    if (!r.ok) return json({ ok: false, error: 'make' }, 502);
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'make' }, 502);
  }
};

export const config = { path: '/api/publicar' };
