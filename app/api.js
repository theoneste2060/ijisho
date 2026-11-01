// Where the Ijisho API lives. In production the app and API share an origin (Vercel rewrites /api and /c
// to the Cloudflare Worker), so paths are relative. During local development the API runs on port 8787.
export const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:8787' : '';
export const PUBLIC_BASE = API_BASE || location.origin; // used to build the photo link sent to agronomists

export async function api(path, { method = 'GET', body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API_BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data: data || {} };
}

export const ROLE_LABELS = {
  extension_officer: { en: 'Extension officer (district / sector)', rw: 'Umukozi ushinzwe ubuhinzi (akarere / umurenge)' },
  farmer_promoter: { en: 'Farmer promoter', rw: 'Umufashamyumvire w’abahinzi' },
  rab: { en: 'RAB agronomist or researcher', rw: 'Umuhanga wa RAB' },
  cooperative: { en: 'Cooperative agronomist', rw: 'Umujyanama wa koperative' },
  agro_dealer: { en: 'Agro-dealer', rw: 'Ucuruza inyongeramusaruro' },
  ngo_private: { en: 'NGO or private agronomist', rw: 'Umujyanama wigenga cyangwa wa ONG' },
};
