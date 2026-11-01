// Integration tests against a running local API: `npm run dev` in one terminal, `npm test` in another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { DISTRICTS } from '../src/rwanda.js';

const BASE = process.env.API || 'http://localhost:8787';
const TOKEN = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/ADMIN_TOKEN=(.+)/)[1].trim();
const ip = () => `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const phone = () => `0788${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;

const post = (path, data, headers = {}) => fetch(BASE + path, {
  method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip(), ...headers },
});
const admin = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
const valid = (over = {}) => ({ name: 'Test Agronomist', phone: phone(), role: 'extension_officer', organisation: 'Kamonyi District', districts: ['Kamonyi'], languages: ['rw', 'en'], consent: true, ...over });

test('app and API agree on the 30 districts', () => {
  const app = readFileSync(new URL('../../app/districts.js', import.meta.url), 'utf8');
  assert.equal(DISTRICTS.length, 30);
  for (const d of DISTRICTS) assert.ok(app.includes(`'${d}'`), `app/districts.js is missing ${d}`);
});

test('registration validates fields', async () => {
  const r = await post('/api/agronomists', { name: 'x', phone: '123', districts: ['Atlantis'] });
  assert.equal(r.status, 422);
  const j = await r.json();
  assert.deepEqual(Object.keys(j.fields).sort(), ['consent', 'districts', 'name', 'phone', 'role']);
});

test('register → pending, hidden from farmers, duplicate rejected', async () => {
  const a = valid({ districts: ['Huye'] });
  assert.equal((await post('/api/agronomists', a)).status, 201);
  assert.equal((await post('/api/agronomists', { ...a, phone: '+250 ' + a.phone.slice(1) })).status, 409);
  const list = await (await fetch(`${BASE}/api/agronomists?district=Huye`)).json();
  assert.ok(!list.agronomists.some((x) => x.phone === '250' + a.phone.slice(1)));
});

test('honeypot submissions are accepted silently but never stored', async () => {
  const a = valid({ website: 'http://spam.example' });
  assert.equal((await post('/api/agronomists', a)).status, 201);
  const pending = await (await admin('/api/admin/agronomists?status=pending')).json();
  assert.ok(!pending.agronomists.some((x) => x.phone === '250' + a.phone.slice(1)));
});

test('admin endpoints need the token', async () => {
  assert.equal((await fetch(`${BASE}/api/admin/agronomists`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/admin/agronomists`, { headers: { Authorization: 'Bearer wrong-token-123456' } })).status, 401);
});

test('approve → listed in their districts only; reject/delete removes', async () => {
  const a = valid({ name: 'Approve Me', districts: ['Musanze', 'Burera'] });
  await post('/api/agronomists', a);
  const pending = await (await admin('/api/admin/agronomists?status=pending')).json();
  const row = pending.agronomists.find((x) => x.name === 'Approve Me' && x.phone === '250' + a.phone.slice(1));
  assert.ok(row);
  assert.equal((await admin(`/api/admin/agronomists/${row.id}`, { method: 'POST', body: JSON.stringify({ action: 'approve' }) })).status, 200);
  const musanze = await (await fetch(`${BASE}/api/agronomists?district=Musanze`)).json();
  assert.ok(musanze.agronomists.some((x) => x.id === row.id));
  const huye = await (await fetch(`${BASE}/api/agronomists?district=Huye`)).json();
  assert.ok(!huye.agronomists.some((x) => x.id === row.id));
  await admin(`/api/admin/agronomists/${row.id}`, { method: 'POST', body: JSON.stringify({ action: 'reject' }) });
  const after = await (await fetch(`${BASE}/api/agronomists?district=Musanze`)).json();
  assert.ok(!after.agronomists.some((x) => x.id === row.id));
  assert.equal((await admin(`/api/admin/agronomists/${row.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await admin(`/api/admin/agronomists/${row.id}`, { method: 'DELETE' })).status, 404);
});

test('unknown district is refused', async () => {
  assert.equal((await fetch(`${BASE}/api/agronomists?district=Atlantis`)).status, 400);
});

async function upload(bytes, fields = {}) {
  const fd = new FormData();
  fd.set('photo', new Blob([bytes], { type: 'image/jpeg' }), 'leaf.jpg');
  for (const [k, v] of Object.entries({ result: 'bean_rust', confidence: '0.95', lang: 'en', district: 'Kamonyi', ...fields })) fd.set(k, v);
  return fetch(BASE + '/api/cases', { method: 'POST', body: fd, headers: { 'x-forwarded-for': ip() } });
}

test('case upload → photo page and photo; bad files refused; expired cases removed', async () => {
  const jpeg = readFileSync(new URL('../../.testimgs/043.jpg', import.meta.url));
  const r = await upload(jpeg);
  assert.equal(r.status, 201);
  const { id, path } = await r.json();
  assert.match(id, /^[A-Za-z0-9_-]{28,32}$/);
  const page = await fetch(BASE + path);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Bean rust/);
  assert.match(html, /Kamonyi/);
  const photo = await fetch(`${BASE}${path}/photo`);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await photo.arrayBuffer()).length, jpeg.length);

  assert.equal((await upload(Buffer.from('not a jpeg'))).status, 415);
  assert.equal((await upload(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(401 * 1024)]))).status, 413);

  // Expire it, run the daily cron, and the link is gone.
  execSync(`npx wrangler d1 execute ijisho --local --command "UPDATE cases SET expires_at = 1 WHERE id = '${id}'"`, { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  assert.equal((await fetch(BASE + path)).status, 404);
  await fetch(`${BASE}/__scheduled?cron=17+3+*+*+*`);
  const left = execSync(`npx wrangler d1 execute ijisho --local --json --command "SELECT COUNT(*) AS n FROM cases WHERE id = '${id}'"`, { cwd: new URL('..', import.meta.url).pathname }).toString();
  assert.match(left, /"n":\s*0/);
});
