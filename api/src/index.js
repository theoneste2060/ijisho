import { DISTRICTS, ROLES, LANGUAGES, normalizePhone } from './rwanda.js';

// Ijisho API: agronomist registry + escalation photos. Cloudflare Workers + D1 (free tier).
// Served to the app through Vercel rewrites, so the public paths are ijisho-amber.vercel.app/api/... and /c/<id>.

const DAY = 86400;
const CASE_DAYS = 30;
const MAX_PHOTO = 400 * 1024;
const RESULTS = ['angular_leaf_spot', 'bean_rust', 'healthy', 'not_bean', 'unsure'];

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
  // Daily cron: delete expired photos.
  async scheduled(_event, env) {
    await env.DB.prepare('DELETE FROM cases WHERE expires_at < ?').bind(now()).run();
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;

  if (m === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  if (path === '/' || path === '/api') return json({ service: 'ijisho-api', ok: true });

  if (path === '/api/agronomists' && m === 'POST') return register(request, env);
  if (path === '/api/agronomists' && m === 'GET') return listApproved(url, env, request);
  if (path === '/api/cases' && m === 'POST') return createCase(request, env);
  let match = path.match(/^\/c\/([A-Za-z0-9_-]{20,40})$/);
  if (match && m === 'GET') return casePage(match[1], env);
  match = path.match(/^\/c\/([A-Za-z0-9_-]{20,40})\/photo$/);
  if (match && m === 'GET') return casePhoto(match[1], env);

  if (path.startsWith('/api/admin/')) {
    const auth = await checkAdmin(request, env);
    if (auth === 'not_configured') return json({ error: 'admin_not_configured' }, 503, request, env);
    if (auth !== 'ok') return json({ error: 'unauthorised' }, 401, request, env);
    if (path === '/api/admin/agronomists' && m === 'GET') return adminList(url, env, request);
    match = path.match(/^\/api\/admin\/agronomists\/([a-z0-9]{12,40})$/);
    if (match && m === 'POST') return adminAct(match[1], request, env);
    if (match && m === 'DELETE') return adminDelete(match[1], env, request);
  }
  return json({ error: 'not_found' }, 404, request, env);
}

// ---------- registration ----------
async function register(request, env) {
  if (!(await allow(env, request, 'reg', 5, 3600))) return json({ error: 'too_many_requests' }, 429, request, env);
  const b = await body(request);
  if (!b) return json({ error: 'bad_request' }, 400, request, env);
  if (b.website) return json({ ok: true, status: 'pending' }, 201, request, env); // honeypot: bots fill hidden fields

  const errors = {};
  const name = clean(b.name, 60);
  const organisation = clean(b.organisation, 80);
  const note = clean(b.note, 300);
  const phone = normalizePhone(b.phone);
  const role = ROLES.includes(b.role) ? b.role : null;
  const districts = [...new Set((Array.isArray(b.districts) ? b.districts : []).filter((d) => DISTRICTS.includes(d)))];
  const languages = [...new Set((Array.isArray(b.languages) ? b.languages : []).filter((l) => LANGUAGES.includes(l)))];
  if (name.length < 2) errors.name = 'required';
  if (!phone) errors.phone = 'invalid';
  if (!role) errors.role = 'required';
  if (!districts.length) errors.districts = 'required';
  if (b.consent !== true) errors.consent = 'required';
  if (Object.keys(errors).length) return json({ error: 'invalid', fields: errors }, 422, request, env);

  const existing = await env.DB.prepare('SELECT id FROM agronomists WHERE phone = ?').bind(phone).first();
  if (existing) return json({ error: 'already_registered' }, 409, request, env);

  const id = randomId(16);
  await env.DB.prepare(
    `INSERT INTO agronomists (id, name, phone, role, organisation, districts, languages, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).bind(id, name, phone, role, organisation, JSON.stringify(districts), JSON.stringify(languages), note, now()).run();
  return json({ ok: true, status: 'pending' }, 201, request, env);
}

// ---------- public list ----------
// All approved agronomists (the app lists them and lets the farmer search), or one district with ?district=.
async function listApproved(url, env, request) {
  const district = url.searchParams.get('district');
  if (district !== null && !DISTRICTS.includes(district)) return json({ error: 'unknown_district' }, 400, request, env);
  const where = district ? "status = 'approved' AND districts LIKE ?" : "status = 'approved'";
  const stmt = env.DB.prepare(
    `SELECT id, name, phone, role, organisation, districts, languages FROM agronomists WHERE ${where} ORDER BY name COLLATE NOCASE LIMIT 500`,
  );
  // districts is a JSON array of exact names, so a quoted LIKE match is exact.
  const { results } = await (district ? stmt.bind(`%"${district}"%`) : stmt).all();
  const list = results.map((r) => ({ ...r, districts: JSON.parse(r.districts || '[]'), languages: JSON.parse(r.languages || '[]') }));
  return json({ district: district || null, agronomists: list }, 200, request, env, { 'Cache-Control': 'public, max-age=120' });
}

// ---------- escalation cases ----------
async function createCase(request, env) {
  if (!(await allow(env, request, 'case', 30, 3600))) return json({ error: 'too_many_requests' }, 429, request, env);
  if (!(await allow(env, null, 'case-global', 2000, DAY))) return json({ error: 'busy' }, 503, request, env);
  const form = await request.formData().catch(() => null);
  const photo = form && form.get('photo');
  if (!photo || typeof photo === 'string') return json({ error: 'photo_required' }, 400, request, env);
  if (photo.size > MAX_PHOTO) return json({ error: 'photo_too_large' }, 413, request, env);
  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return json({ error: 'jpeg_only' }, 415, request, env);

  const result = RESULTS.includes(form.get('result')) ? form.get('result') : 'unsure';
  const confidence = Math.max(0, Math.min(1, Number(form.get('confidence')) || 0));
  const lang = form.get('lang') === 'rw' ? 'rw' : 'en';
  const district = DISTRICTS.includes(form.get('district')) ? form.get('district') : '';
  const id = randomId(22, true);
  const t = now();
  await env.DB.prepare(
    'INSERT INTO cases (id, photo, result, confidence, lang, district, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, bytes, result, confidence, lang, district, t, t + CASE_DAYS * DAY).run();
  return json({ ok: true, id, path: `/c/${id}`, expires_in_days: CASE_DAYS }, 201, request, env);
}

async function getCase(id, env, withPhoto) {
  const cols = withPhoto ? 'photo' : 'result, confidence, lang, district, created_at, expires_at';
  const row = await env.DB.prepare(`SELECT ${cols} FROM cases WHERE id = ? AND expires_at > ?`).bind(id, now()).first();
  return row;
}

async function casePhoto(id, env) {
  const row = await getCase(id, env, true);
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(row.photo), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Robots-Tag': 'noindex' },
  });
}

const LABELS = {
  en: { angular_leaf_spot: 'Angular leaf spot', bean_rust: 'Bean rust', healthy: 'Looks healthy', not_bean: 'Not a bean leaf', unsure: 'Ijisho was not sure', title: 'Ijisho bean leaf check', result: 'Ijisho’s result', confidence: 'confidence', district: 'District', sent: 'Sent', expires: 'This photo is deleted automatically on', note: 'Ijisho is a screening aid. Please check the leaf and reply to the farmer on WhatsApp.', gone: 'This photo has expired or does not exist.' },
  rw: { angular_leaf_spot: 'Indwara y’utubara tw’impande', bean_rust: 'Ingese y’ibishyimbo', healthy: 'Gisa n’ikizima', not_bean: 'Si ikibabi cy’igishyimbo', unsure: 'Ijisho ntiryari ryizeye', title: 'Isuzuma rya Ijisho', result: 'Igisubizo cya Ijisho', confidence: 'icyizere', district: 'Akarere', sent: 'Byoherejwe', expires: 'Iyi foto izasibwa ku itariki ya', note: 'Ijisho rifasha gusa kubona ikibazo. Suzuma ikibabi maze usubize umuhinzi kuri WhatsApp.', gone: 'Iyi foto yarasibwe cyangwa ntibaho.' },
};

async function casePage(id, env) {
  const row = await getCase(id, env, false);
  const L = LABELS[row?.lang === 'rw' ? 'rw' : 'en'];
  const fmt = (s) => new Date(s * 1000).toISOString().slice(0, 10);
  const bodyHtml = row
    ? `<img src="/c/${id}/photo" alt="Bean leaf photo sent by a farmer">
       <h1>${esc(L.title)}</h1>
       <p class="r">${esc(L.result)}: <b>${esc(L[row.result] || row.result)}</b> (${Math.round(row.confidence * 100)}% ${esc(L.confidence)})</p>
       ${row.district ? `<p>${esc(L.district)}: ${esc(row.district)}</p>` : ''}
       <p>${esc(L.sent)}: ${fmt(row.created_at)}</p>
       <p class="n">${esc(L.note)}</p>
       <p class="s">${esc(L.expires)} ${fmt(row.expires_at)}.</p>`
    : `<h1>Ijisho</h1><p>${esc(L.gone)}</p>`;
  const html = `<!doctype html><html lang="${row?.lang === 'rw' ? 'rw' : 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Ijisho</title><style>
body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#0B1F33;background:#F3F5F7}
main{max-width:34rem;margin:0 auto;background:#fff;min-height:100vh;padding:0 0 1.5rem}
img{display:block;width:100%;max-height:70vh;object-fit:contain;background:#000}
h1{font-size:1.3rem;margin:1rem 1rem .3rem}p{margin:.3rem 1rem}.r b{color:#B45309}
.n{margin-top:1rem;padding:.8rem;background:#F0FDF4;border-left:4px solid #22C55E}.s{color:#5F6B76;font-size:.85rem}
</style></head><body><main>${bodyHtml}</main></body></html>`;
  return new Response(html, {
    status: row ? 200 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

// ---------- admin ----------
const MIN_ADMIN_PASSWORD = 12;

// Returns 'ok', 'not_configured', 'no_password' or 'mismatch'. Spaces and line breaks around either side are
// ignored (they are easy to paste by accident). The reason and lengths go to the private Worker log, never the value.
async function checkAdmin(request, env) {
  const secret = (env.ADMIN_TOKEN || '').trim();
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let reason;
  if (secret.length < MIN_ADMIN_PASSWORD) reason = 'not_configured';
  else if (!token) reason = 'no_password';
  else {
    const [a, b] = [await sha(token), await sha(secret)];
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    reason = diff === 0 ? 'ok' : 'mismatch';
  }
  if (reason !== 'ok') console.log(JSON.stringify({ admin_auth: reason, sent_length: token.length, server_length: secret.length, raw_server_length: (env.ADMIN_TOKEN || '').length }));
  return reason;
}

async function adminList(url, env, request) {
  const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
  const { results } = await env.DB.prepare(
    'SELECT id, name, phone, role, organisation, districts, languages, note, status, created_at, reviewed_at FROM agronomists WHERE status = ? ORDER BY created_at DESC LIMIT 200',
  ).bind(status).all();
  const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM agronomists GROUP BY status').all();
  return json({
    status,
    counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])),
    agronomists: results.map((r) => ({ ...r, districts: JSON.parse(r.districts), languages: JSON.parse(r.languages || '[]') })),
  }, 200, request, env);
}

async function adminAct(id, request, env) {
  const b = await body(request);
  const status = { approve: 'approved', reject: 'rejected', pending: 'pending' }[b?.action];
  if (!status) return json({ error: 'bad_action' }, 400, request, env);
  const r = await env.DB.prepare('UPDATE agronomists SET status = ?, reviewed_at = ? WHERE id = ?').bind(status, now(), id).run();
  if (!r.meta.changes) return json({ error: 'not_found' }, 404, request, env);
  return json({ ok: true, id, status }, 200, request, env);
}

async function adminDelete(id, env, request) {
  const r = await env.DB.prepare('DELETE FROM agronomists WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return json({ error: 'not_found' }, 404, request, env);
  return json({ ok: true, id, deleted: true }, 200, request, env);
}

// ---------- helpers ----------
const now = () => Math.floor(Date.now() / 1000);
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function body(request) {
  try { return await request.json(); } catch { return null; }
}

function randomId(bytes, urlSafe = false) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  if (!urlSafe) return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function clientKey(request) {
  // Behind the Vercel rewrite the first x-forwarded-for entry is the farmer; direct calls use Cloudflare's header.
  const xff = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return xff || request.headers.get('cf-connecting-ip') || 'unknown';
}

// Fixed-window counter in D1. request = null means a global limit.
async function allow(env, request, name, limit, windowSec) {
  const key = `${name}:${request ? await sha(clientKey(request)) : 'all'}`;
  const t = now();
  const row = await env.DB.prepare('SELECT count, window_start FROM rate WHERE key = ?').bind(key).first();
  if (!row || t - row.window_start >= windowSec) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate (key, count, window_start) VALUES (?, 1, ?)').bind(key, t).run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare('UPDATE rate SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin' }
    : {};
}

function json(data, status = 200, request, env, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(request ? cors(request, env) : {}), ...extra },
  });
}
