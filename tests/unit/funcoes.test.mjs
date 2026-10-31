import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pinCorreto, validarEmenta } from '../../netlify/functions/_lib.mjs';
import pin from '../../netlify/functions/pin.mjs';
import publicar from '../../netlify/functions/publicar.mjs';

// Valores de teste. Os reais vivem só nas variáveis de ambiente do Netlify.
const env = { PINS: '1234, 5678', MAKE_WEBHOOK_URL: 'https://make.test/hook' };
const pedido = (url, corpo, metodo = 'POST') =>
  new Request(`https://app.test${url}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
const ementa = { local: 'Infantado', sopas: ['Canja', 'Juliana'], pratos: ['Bacalhau com natas'] };

let enviados;
const fetchOriginal = globalThis.fetch;
beforeEach(() => {
  Object.assign(process.env, env);
  enviados = [];
  globalThis.fetch = async (url, opcoes) => {
    enviados.push({ url, corpo: JSON.parse(opcoes.body) });
    return new Response('Accepted', { status: 200 });
  };
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

test('PIN: só aceita os PINs configurados, com 4 dígitos', () => {
  assert.equal(pinCorreto('1234', env), true);
  assert.equal(pinCorreto('5678', env), true);
  assert.equal(pinCorreto('0000', env), false);
  assert.equal(pinCorreto('12345', env), false);
  assert.equal(pinCorreto(1234, env), false);
  assert.equal(pinCorreto('', { PINS: '' }), false);
});

test('ementa: aceita o formato da app e rejeita o resto', () => {
  assert.deepEqual(validarEmenta(ementa), ementa);
  assert.equal(validarEmenta({ ...ementa, local: 'Lisboa' }), null);
  assert.equal(validarEmenta({ ...ementa, sopas: [] }), null);
  assert.equal(validarEmenta({ ...ementa, sopas: ['A', 'B', 'C'] }), null);
  assert.equal(validarEmenta({ ...ementa, pratos: [] }), null);
  assert.equal(validarEmenta({ ...ementa, pratos: ['x'.repeat(81)] }), null);
  assert.equal(validarEmenta(null), null);
});

test('/api/pin: 200 com PIN certo, 401 com errado, 204 a acordar', async () => {
  assert.equal((await pin(pedido('/api/pin', { pin: '1234' }))).status, 200);
  assert.equal((await pin(pedido('/api/pin', { pin: '9999' }))).status, 401);
  assert.equal((await pin(pedido('/api/pin', undefined, 'GET'))).status, 204);
});

test('/api/publicar: com PIN certo envia ao Make só local, sopas e pratos', async () => {
  const r = await publicar(pedido('/api/publicar', { pin: '1234', ...ementa }));
  assert.equal(r.status, 200);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].url, env.MAKE_WEBHOOK_URL);
  assert.deepEqual(enviados[0].corpo, ementa); // o PIN nunca segue para o Make
});

test('/api/publicar: PIN errado não chega ao Make', async () => {
  const r = await publicar(pedido('/api/publicar', { pin: '0000', ...ementa }));
  assert.equal(r.status, 401);
  assert.equal(enviados.length, 0);
});

test('/api/publicar: ementa inválida não chega ao Make', async () => {
  const r = await publicar(pedido('/api/publicar', { pin: '1234', ...ementa, local: '' }));
  assert.equal(r.status, 400);
  assert.equal(enviados.length, 0);
});

test('/api/publicar: se o Make falhar, a app recebe erro', async () => {
  globalThis.fetch = async () => new Response('', { status: 500 });
  const r = await publicar(pedido('/api/publicar', { pin: '1234', ...ementa }));
  assert.equal(r.status, 502);
});

test('/api/publicar: sem webhook configurado não envia', async () => {
  delete process.env.MAKE_WEBHOOK_URL;
  const r = await publicar(pedido('/api/publicar', { pin: '1234', ...ementa }));
  assert.equal(r.status, 500);
  assert.equal(enviados.length, 0);
});
