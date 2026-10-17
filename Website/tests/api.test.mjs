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
  state.profiles ??= {};
  return {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          if (sql.includes('FROM member_profiles')) return { results: Object.entries(state.profiles).map(([user_id, value]) => ({ user_id, ...value })) };
          if (sql.includes('FROM website_people')) return { results: state.people };
          return { results: [] };
        },
        async first() {
          if (sql.includes('FROM member_profiles') && sql.includes('lower(account_email)')) {
            const email = String(this.values[0] || '').toLowerCase();
            return Object.entries(state.profiles).map(([user_id, value]) => ({ user_id, ...value })).find(profile => String(profile.account_email || '').toLowerCase() === email) || null;
          }
          if (sql.includes('FROM member_profiles')) return state.profiles[this.values[0]] || null;
          if (sql.includes('FROM website_people') && sql.includes('lower(email)')) {
            const email = String(this.values[0] || '').toLowerCase();
            const person = state.people.find(value => String(value.email || '').toLowerCase() === email);
            return person ? (sql.includes('SELECT id FROM') ? { id: person.id } : person) : null;
          }
          if (sql.includes('FROM admin_role_members')) return { permissions: '["website.*"]' };
          if (sql.includes('SELECT content, revision')) return { content: JSON.stringify(state.content), revision: state.revision };
          if (sql.includes('SELECT revision FROM website_content')) return { revision: state.revision };
          return null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO member_profiles')) {
            state.profiles[this.values[0]] = { account_email:this.values[1], revision:1, private_data:this.values[2], public_fields:this.values[3], display_order:0, updated_at:this.values[5] };
          }
          if (sql.startsWith('UPDATE member_profiles')) {
            const row=state.profiles[this.values[4]];
            if(!row||Number(row.revision)!==Number(this.values[5]))return {meta:{changes:0}};
            Object.assign(row,{account_email:this.values[0],revision:Number(row.revision)+1,private_data:this.values[1],public_fields:this.values[2],updated_at:this.values[3]});
          }
          if (sql.startsWith('INSERT INTO website_people')) {
            const [id, name, email, position, description, location, createdAt, updatedAt] = this.values;
            state.people.push({ id, revision:1, name, email, position, status:'inactive', description, location, display_order:0, created_at:createdAt, updated_at:updatedAt });
          }
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
  const payload = Buffer.from(JSON.stringify({ aud: 'halal-map-karamah', iss: 'https://securetoken.google.com/halal-map-karamah', sub: 'admin-user', exp: now + 3600, iat: now, auth_time: now, name: 'Amina Hassan', email: 'editor@karamahcollective.com', email_verified: true, ...overrides })).toString('base64url');
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

test('member profiles return private data only to their owner and project selected public fields', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).startsWith('https://www.googleapis.com/')) return Response.json({ keys: [jwk] });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  const state = {};
  const profileEnv = { ...env, DB: createTestDb(state) };
  const save = await onRequest({ request: request('save-my-profile', { revision:0, profile:{ fullName:'Amina Hassan', role:'Coordinator', phone:'+358 40 123 4567', bio:'Private biography' }, publicFields:['fullName','role'] }), env:profileEnv });
  assert.equal(save.status, 200);
  const own = await (await onRequest({ request:request('my-profile'), env:profileEnv })).json();
  assert.equal(own.profile.phone, '+358 40 123 4567');
  const other = await (await onRequest({ request:request('my-profile', null, token({ sub:'another-user', email:'other@karamahcollective.com' })), env:profileEnv })).json();
  assert.equal(other.profile.phone, '');
  const directory = await (await onRequest({ request:request('admin-team'), env:profileEnv })).json();
  assert.equal(directory.people[0].fullName, 'Amina Hassan');
  assert.equal(directory.people[0].role, 'Coordinator');
  assert.equal(directory.people[0].email, 'editor@karamahcollective.com');
  assert.equal('phone' in directory.people[0], false);
  assert.equal('bio' in directory.people[0], false);
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
  const contactEnv = { ...env, DB: createTestDb(databaseState), TURNSTILE_SECRET_KEY: 'test-turnstile-secret' };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('challenges.cloudflare.com/turnstile')) return Response.json({ success: true, action: 'contact' });
    if (String(url).includes('brevo.com')) return Response.json({ messageId: 'test-message' });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const send = async updates => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: 'Test visitor', email: 'visitor@example.test', message: 'Hello', updates, turnstileToken: 'test-turnstile-token', _started: String(Date.now() - 3000) })) form.set(key, value);
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

test('contact does not claim delivery when anti-bot timing is missing', async () => {
  const response = await contactRequest({
    env,
    request: new Request('https://website.test/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test visitor', email: 'visitor@example.test', message: 'Hello', turnstileToken: 'test-token' }),
    }),
  });
  const data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.success, false);

  const honeypot = await contactRequest({
    env,
    request: new Request('https://website.test/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test visitor', email: 'visitor@example.test', message: 'Hello', _hp: 'filled' }),
    }),
  });
  assert.equal(honeypot.status, 403);
  assert.equal((await honeypot.json()).success, false);
});
