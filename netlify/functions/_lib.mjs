// Shared rules for the functions. Secrets live only in Netlify environment variables:
//   PINS             valid staff PINs, comma-separated
//   MAKE_WEBHOOK_URL the Make scenario's webhook URL
//   MAKE_API_KEY     key the Make webhook requires in the x-make-apikey header

export const LOCATIONS = ['Infantado', 'Odivelas'];
const MAX_TEXT = 80;

export function validPins(env = process.env) {
  return String(env.PINS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function isValidPin(pin, env = process.env) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin) && validPins(env).includes(pin);
}

const isTextList = (v, min, max) =>
  Array.isArray(v) &&
  v.length >= min &&
  v.length <= max &&
  v.every((x) => typeof x === 'string' && x.trim().length > 0 && x.length <= MAX_TEXT);

// Returns the cleaned menu, or null if it is not valid.
// Field names (local, sopas, pratos) match the payload the Make scenario expects.
export function validateMenu(body) {
  if (!body || typeof body !== 'object') return null;
  const { local, sopas, pratos } = body;
  if (!LOCATIONS.includes(local)) return null;
  if (!isTextList(sopas, 1, 2)) return null;
  if (!isTextList(pratos, 1, 40)) return null;
  return { local, sopas: sopas.map((s) => s.trim()), pratos: pratos.map((p) => p.trim()) };
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
