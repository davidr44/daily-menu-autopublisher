// Regras partilhadas pelas funções. Os segredos vivem só em variáveis de ambiente do Netlify:
//   PINS             PINs válidos, separados por vírgulas
//   MAKE_WEBHOOK_URL endereço do webhook do cenário no Make
//   MAKE_API_KEY     chave que o webhook do Make exige no cabeçalho x-make-apikey

export const LOCAIS = ['Infantado', 'Odivelas'];
const MAX_TEXTO = 80;

export function pinsValidos(env = process.env) {
  return String(env.PINS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function pinCorreto(pin, env = process.env) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin) && pinsValidos(env).includes(pin);
}

const listaDeTextos = (v, min, max) =>
  Array.isArray(v) &&
  v.length >= min &&
  v.length <= max &&
  v.every((x) => typeof x === 'string' && x.trim().length > 0 && x.length <= MAX_TEXTO);

// Devolve a ementa limpa, ou null se não for válida
export function validarEmenta(body) {
  if (!body || typeof body !== 'object') return null;
  const { local, sopas, pratos } = body;
  if (!LOCAIS.includes(local)) return null;
  if (!listaDeTextos(sopas, 1, 2)) return null;
  if (!listaDeTextos(pratos, 1, 40)) return null;
  return { local, sopas: sopas.map((s) => s.trim()), pratos: pratos.map((p) => p.trim()) };
}

export const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function lerJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
