import { api, ROLE_LABELS } from '../api.js';

const $ = (s) => document.querySelector(s);
const KEY = 'ijisho-admin-token';
let status = 'pending';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = (s) => (s ? new Date(s * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const LANGS = { rw: 'Kinyarwanda', en: 'English', fr: 'Français', sw: 'Kiswahili' };

async function load() {
  const token = sessionStorage.getItem(KEY);
  const r = await api(`/api/admin/agronomists?status=${status}`, { token });
  if (r.status === 401) return logout('wrong');
  if (r.status === 503) return logout('server');
  $('#login').hidden = true;
  $('#panel').hidden = false;
  $('#logout').hidden = false;
  for (const b of document.querySelectorAll('[data-status]')) {
    const n = r.data.counts?.[b.dataset.status] || 0;
    b.textContent = `${b.dataset.status[0].toUpperCase()}${b.dataset.status.slice(1)} (${n})`;
    b.setAttribute('aria-pressed', String(b.dataset.status === status));
  }
  const list = r.data.agronomists || [];
  $('#list').innerHTML = list.length ? list.map(card).join('') : `<p class="empty">Nothing ${status}.</p>`;
}

function card(a) {
  const actions = {
    pending: [['approve', 'Approve', 'primary'], ['reject', 'Reject', 'outline']],
    approved: [['reject', 'Remove from app', 'outline']],
    rejected: [['approve', 'Approve', 'primary']],
  }[a.status];
  return `<article class="agro" data-id="${esc(a.id)}">
    <h3>${esc(a.name)}</h3>
    <p>${esc(ROLE_LABELS[a.role]?.en || a.role)}${a.organisation ? ` · ${esc(a.organisation)}` : ''}</p>
    <p>WhatsApp <a href="https://wa.me/${esc(a.phone)}" target="_blank" rel="noopener">+${esc(a.phone)}</a></p>
    <p>Districts: ${esc(a.districts.join(', '))}</p>
    <p>Languages: ${esc(a.languages.map((l) => LANGS[l] || l).join(', ') || '—')}</p>
    ${a.note ? `<p>Note: “${esc(a.note)}”</p>` : ''}
    <p>Registered ${esc(date(a.created_at))}${a.reviewed_at ? ` · reviewed ${esc(date(a.reviewed_at))}` : ''}</p>
    <div class="row">
      ${actions.map(([act, label, cls]) => `<button class="btn ${cls}" data-act="${act}" type="button">${label}</button>`).join('')}
      <button class="btn danger" data-act="delete" type="button">Delete</button>
    </div>
  </article>`;
}

const LOGIN_ERRORS = {
  wrong: 'Wrong password.',
  server: 'The admin password on the server is not set (or is shorter than 12 characters). Set it from a normal terminal: cd ~/projects/ijisho/api && npx wrangler secret put ADMIN_TOKEN',
};

function logout(reason) {
  sessionStorage.removeItem(KEY);
  $('#panel').hidden = true;
  $('#logout').hidden = true;
  $('#login').hidden = false;
  $('#loginErr').textContent = LOGIN_ERRORS[reason] || '';
  $('#loginErr').hidden = !LOGIN_ERRORS[reason];
}

$('#login').addEventListener('submit', (e) => {
  e.preventDefault();
  sessionStorage.setItem(KEY, $('#token').value);
  $('#token').value = '';
  load();
});
$('#logout').addEventListener('click', () => logout());
for (const b of document.querySelectorAll('[data-status]')) {
  b.addEventListener('click', () => { status = b.dataset.status; load(); });
}

// Delete asks for a second tap instead of a browser pop-up.
$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const token = sessionStorage.getItem(KEY);
  if (btn.dataset.act === 'delete') {
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Tap again to delete';
      setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Delete'; }, 4000);
      return;
    }
    await api(`/api/admin/agronomists/${id}`, { method: 'DELETE', token });
  } else {
    await api(`/api/admin/agronomists/${id}`, { method: 'POST', token, body: { action: btn.dataset.act } });
  }
  load();
});

if (sessionStorage.getItem(KEY)) load();
