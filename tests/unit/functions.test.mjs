import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isValidPin, validateMenu } from '../../netlify/functions/_lib.mjs';
import pin from '../../netlify/functions/pin.mjs';
import publicar from '../../netlify/functions/publicar.mjs';

// Test values. The real ones live only in Netlify environment variables.
const env = { PINS: '1234, 5678', MAKE_WEBHOOK_URL: 'https://make.test/hook' };
const request = (url, body, method = 'POST') =>
  new Request(`https://app.test${url}`, {
    method: method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const menu = { local: 'Infantado', sopas: ['Canja', 'Juliana'], pratos: ['Bacalhau com natas'] };

let sent;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.assign(process.env, env);
  sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body), headers: options.headers });
    return new Response('Accepted', { status: 200 });
  };
});
afterEach(() => { globalThis.fetch = originalFetch; });

test('PIN: accepts only the configured 4-digit PINs', () => {
  assert.equal(isValidPin('1234', env), true);
  assert.equal(isValidPin('5678', env), true);
  assert.equal(isValidPin('0000', env), false);
  assert.equal(isValidPin('12345', env), false);
  assert.equal(isValidPin(1234, env), false);
  assert.equal(isValidPin('', { PINS: '' }), false);
});

test('menu: accepts the app format and rejects anything else', () => {
  assert.deepEqual(validateMenu(menu), menu);
  assert.equal(validateMenu({ ...menu, local: 'Lisboa' }), null);
  assert.equal(validateMenu({ ...menu, sopas: [] }), null);
  assert.equal(validateMenu({ ...menu, sopas: ['A', 'B', 'C'] }), null);
  assert.equal(validateMenu({ ...menu, pratos: [] }), null);
  assert.equal(validateMenu({ ...menu, pratos: ['x'.repeat(81)] }), null);
  assert.equal(validateMenu(null), null);
});

test('/api/pin: 200 for a valid PIN, 401 for a wrong one, 204 on wake-up', async () => {
  assert.equal((await pin(request('/api/pin', { pin: '1234' }))).status, 200);
  assert.equal((await pin(request('/api/pin', { pin: '9999' }))).status, 401);
  assert.equal((await pin(request('/api/pin', undefined, 'GET'))).status, 204);
});

test('/api/publicar: with a valid PIN, sends Make only local, sopas and pratos', async () => {
  const r = await publicar(request('/api/publicar', { pin: '1234', ...menu }));
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, env.MAKE_WEBHOOK_URL);
  assert.deepEqual(sent[0].body, menu); // the PIN never reaches Make
});

test('/api/publicar: sends the webhook API key header when configured', async () => {
  process.env.MAKE_API_KEY = 'test-key';
  await publicar(request('/api/publicar', { pin: '1234', ...menu }));
  assert.equal(sent[0].headers['x-make-apikey'], 'test-key');
  delete process.env.MAKE_API_KEY;
});

test('/api/publicar: a wrong PIN never reaches Make', async () => {
  const r = await publicar(request('/api/publicar', { pin: '0000', ...menu }));
  assert.equal(r.status, 401);
  assert.equal(sent.length, 0);
});

test('/api/publicar: an invalid menu never reaches Make', async () => {
  const r = await publicar(request('/api/publicar', { pin: '1234', ...menu, local: '' }));
  assert.equal(r.status, 400);
  assert.equal(sent.length, 0);
});

test('/api/publicar: a Make failure returns an error to the app', async () => {
  globalThis.fetch = async () => new Response('', { status: 500 });
  const r = await publicar(request('/api/publicar', { pin: '1234', ...menu }));
  assert.equal(r.status, 502);
});

test('/api/publicar: does not send without a configured webhook', async () => {
  delete process.env.MAKE_WEBHOOK_URL;
  const r = await publicar(request('/api/publicar', { pin: '1234', ...menu }));
  assert.equal(r.status, 500);
  assert.equal(sent.length, 0);
});
