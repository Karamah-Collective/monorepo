import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { onRequest } from '../functions/api/admin.js';
import { onRequestGet as contentRequest } from '../functions/api/content.js';
import { onRequestPost as contactRequest } from '../functions/api/contact.js';
import { WEBSITE_DEFAULTS, validateWebsiteContent, publicWebsiteContent } from '../assets/js/content-schema.mjs';

function createTestDb(state = {}) {
  state.content ??= {};
  state.revision ??= 0;
  state.people ??= [];
  state.subscriptions ??= [];
  return {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          if (sql.includes('FROM website_people')) return { results: state.people };
          return { results: [] };
        },
        async first() {
          if (sql.includes('SELECT content, revision')) return { content: JSON.stringify(state.content), revision: state.revision };
          if (sql.includes('SELECT revision FROM website_content')) return { revision: state.revision };
          return null;
        },
        async run() {
          if (sql.startsWith('UPDATE website_content')) {
            if (state.conflict) return { meta: { changes: 0 } };
            state.content = JSON.parse(this.values[0]);
            state.revision += 1;
          }
          if (sql.startsWith('INSERT INTO website_subscribers')) {
            if (state.failSubscribe) throw new Error('Unavailable');
            state.subscriptions.push(this.values);
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
}

const env = { DB: createTestDb(), BREVO_API_KEY: 'test-only' };
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'unit-test', alg: 'RS256', use: 'sig' };
function token(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ aud: 'halal-map-karamah', iss: 'https://securetoken.google.com/halal-map-karamah', sub: 'admin-user', exp: now + 3600, iat: now, auth_time: now, email: 'editor@karamahcollective.com', email_verified: true, ...overrides })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}
function request(action, body, bearer = token(), origin = 'https://admin.karamahcollective.com') {
  const url = new URL('https://website.test/api/admin');
  if (!body) url.searchParams.set('action', action);
  return new Request(url, { method: body ? 'POST' : 'GET', headers: { Origin: origin, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify({ ...body, action }) : undefined });
}

test('website admin verifies real JWT signatures, verified domain and exact CORS origin', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('https://www.googleapis.com/')) return Response.json({ keys: [jwk] });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  assert.equal((await onRequest({ request: request('admin-team', null, ''), env })).status, 401);
  assert.equal((await onRequest({ request: request('admin-team', null, 'forged'), env })).status, 401);
  assert.equal((await onRequest({ request: request('admin-team', null, token({ email: 'editor@evilkaramahcollective.com' })), env })).status, 403);
  assert.equal((await onRequest({ request: request('admin-team', null, token({ email_verified: false })), env })).status, 403);
  assert.equal((await onRequest({ request: request('admin-team', null, token(), 'https://attacker.test'), env })).status, 403);
  const result = await onRequest({ request: request('admin-team'), env });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://admin.karamahcollective.com');
  assert.equal((await result.json()).capabilities.d1, true);
  assert.equal((await onRequest({ request: request('admin-team', null, token(), 'https://admin.maps.karamahcollective.com'), env })).status, 200);
  assert.equal((await onRequest({ request: request('admin-team', null, token(), 'https://preview-admin.pages.dev'), env: { ...env, ADMIN_ALLOWED_ORIGINS: 'https://preview-admin.pages.dev' } })).status, 200);
});

test('admin rejects unsafe content and preserves D1 revision conflicts', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!options?.body) return Response.json({ keys: [jwk] });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  const conflictEnv = { ...env, DB: createTestDb({ conflict: true }) };
  for (const content of [{ instagramUrl: 'javascript:alert(1)' }, { teamVisible: 'false' }, { unknown: 'field' }]) {
    assert.equal((await onRequest({ request: request('save-content', { revision: 0, content }), env: conflictEnv })).status, 400);
  }
  const response = await onRequest({ request: request('save-content', { revision: 0, content: { heroTitle: 'Hello' }, actor: { email: 'spoofed@example.test' } }), env: conflictEnv });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Reload/);
});

test('missing connection falls back to original public content but fails private edits clearly', async () => {
  const publicResponse = await contentRequest({ env: {} });
  assert.equal(publicResponse.status, 200);
  const data = await publicResponse.json();
  assert.equal(data.fallback, true);
  assert.deepEqual(data.content, WEBSITE_DEFAULTS);
  assert.equal(validateWebsiteContent({ heroTitle: '<img src=x onerror=alert(1)>' }), null);
  assert.equal(publicWebsiteContent({ instagramUrl: 'http://unsafe.test', mapsVisible: false }).instagramUrl, WEBSITE_DEFAULTS.instagramUrl);
  assert.equal(publicWebsiteContent({ mapsVisible: false }).mapsVisible, false);
});

test('local website preview injects a mock ticket without production env', async () => {
  const response = await contentRequest({ env: {}, request: new Request('http://127.0.0.1:8789/api/content') });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.content.ticketsVisible, true);
  assert.equal(data.content.ticketTitle, 'Karamah Community Dinner');
  assert.match(data.content.ticketUrl, /^https:\/\//);
});

test('contact writes only explicit opt-ins and reports a failed database save honestly', async t => {
  const databaseState = {};
  const contactEnv = { ...env, DB: createTestDb(databaseState) };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('brevo.com')) return Response.json({ messageId: 'test-message' });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const send = async updates => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: 'Test visitor', email: 'visitor@example.test', message: 'Hello', updates, _started: String(Date.now() - 3000) })) form.set(key, value);
    return (await contactRequest({ env: contactEnv, request: new Request('https://website.test/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) }) })).json();
  };
  assert.equal((await send('no')).sheetSaved, false);
  assert.equal(databaseState.subscriptions.length, 0);
  assert.equal((await send('yes')).sheetSaved, true);
  assert.equal(databaseState.subscriptions.length, 1);
  assert.equal(databaseState.subscriptions[0][2], 'visitor@example.test');
  databaseState.failSubscribe = true;
  const failed = await send('yes');
  assert.equal(failed.success, true);
  assert.equal(failed.sheetSaved, false);
});
