import { T, CLASSES, RESULTS, CONFIDENT, APP_URL } from './content.js';
import { PROVINCES, PROVINCES_RW, DISTRICTS } from './districts.js';
import { api, PUBLIC_BASE, ROLE_LABELS } from './api.js';

const $ = (id) => document.getElementById(id);
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
// Saved choice first, otherwise Kinyarwanda for phones set to Kinyarwanda.
let lang = localStorage.getItem('ijisho-lang') || ((navigator.language || '').startsWith('rw') ? 'rw' : 'en');
let session;
let last; // last prediction, so switching language re-renders it
let lastFile; // the photo being checked, kept so it can be shared with an agronomist

// ---------- language ----------
function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) {
    const key = el.dataset.t;
    if (key === 'loading' && session) continue;
    if (T[lang][key]) el.textContent = T[lang][key];
  }
  for (const el of document.querySelectorAll('[data-ph]')) el.placeholder = T[lang][el.dataset.ph] || '';
  if (session) $('status').textContent = T[lang].ready;
  if (last) render(last);
}
$('lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'rw' : 'en';
  localStorage.setItem('ijisho-lang', lang);
  applyLang();
});

// ---------- model ----------
async function loadModel() {
  ort.env.wasm.wasmPaths = new URL('vendor/', location.href).href;
  ort.env.wasm.numThreads = 1; // works without cross-origin isolation, on any phone
  session = await ort.InferenceSession.create('model/ijisho-beans.onnx', { executionProviders: ['wasm'] });
  $('status').textContent = T[lang].ready;
  $('status').classList.add('ok');
}

// Same steps as training: short side to 256, centre crop 224, ImageNet normalisation.
async function toTensor(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = 256 / Math.min(bmp.width, bmp.height);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(224, 224);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (224 - w) / 2, (224 - h) / 2, w, h);
  bmp.close();
  const { data } = ctx.getImageData(0, 0, 224, 224);
  const out = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < 224 * 224; i++) {
    for (let c = 0; c < 3; c++) out[c * 224 * 224 + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return new ort.Tensor('float32', out, [1, 3, 224, 224]);
}

function softmax(logits) {
  const m = Math.max(...logits);
  const e = logits.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export async function classify(file) {
  const input = await toTensor(file);
  const out = await session.run({ image: input });
  const probs = softmax(Array.from(out.logits.data));
  const best = probs.indexOf(Math.max(...probs));
  return { cls: CLASSES[best], p: probs[best], probs };
}

// ---------- UI ----------
function render({ cls, p }) {
  const sure = p >= CONFIDENT;
  const r = sure ? RESULTS[cls][lang] : { name: T[lang].unsureTitle, what: T[lang].unsureText, advice: T[lang].unsureAdvice };
  $('card').className = 'card ' + (sure ? RESULTS[cls].tone : 'unsure');
  $('name').textContent = r.name;
  $('what').textContent = r.what;
  $('pct').textContent = Math.round(p * 100) + '%';
  $('bar').style.width = Math.round(p * 100) + '%';
  $('advice').replaceChildren(...r.advice.map((a) => Object.assign(document.createElement('li'), { textContent: a })));
  $('checking').hidden = true;
  $('answer').hidden = false;
  renderAsk();
}

async function handle(file) {
  if (!file) return;
  $('intro').hidden = true;
  $('result').hidden = false;
  $('answer').hidden = true;
  $('checking').hidden = false;
  $('checking').textContent = T[lang].checking;
  $('preview').src = URL.createObjectURL(file);
  lastFile = file;
  $('ask').hidden = true;
  try {
    if (!session) await ready;
    last = await classify(file);
    render(last);
  } catch (e) {
    console.error(e);
    $('checking').textContent = T[lang].error;
  }
}

for (const id of ['camera', 'gallery']) {
  $(id).addEventListener('change', (e) => {
    handle(e.target.files[0]);
    e.target.value = '';
  });
}
$('again').addEventListener('click', () => {
  last = null;
  lastFile = null;
  $('ask').hidden = true;
  $('result').hidden = true;
  $('intro').hidden = false;
});

// ---------- ask an agronomist ----------
// The farmer picks a district once; Ijisho lists the agronomists approved for it. Tapping one uploads a
// smaller copy of the photo (deleted after 30 days) and opens WhatsApp with the result and a link to the photo.
// "Share another way" uses the phone's share menu and uploads nothing.
const DISTRICT_KEY = 'ijisho-district';
const LIST_KEY = (d) => `ijisho-agros-${d}`;
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
let district = localStorage.getItem(DISTRICT_KEY) || '';
let agros = [];
let agroState = 'idle'; // idle | loading | online | offline | none-offline

function resultLine() {
  const t = T[lang];
  if (!last) return '';
  const sure = last.p >= CONFIDENT;
  const name = sure ? RESULTS[last.cls][lang].name : t.msgUnsure;
  return `${t.msgResult}: ${name} (${Math.round(last.p * 100)}%)`;
}

function today() {
  const now = new Date();
  // Phones have no Kinyarwanda date format, so Kinyarwanda uses day/month/year numbers.
  return lang === 'rw'
    ? `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`
    : now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function message({ to, link, photoAttached }) {
  const t = T[lang];
  return [
    to ? fill(t.msgHello, { name: to }) : '',
    `${t.msgIntro} · ${today()}`,
    district ? `${t.msgDistrict}: ${district}` : '',
    resultLine(),
    link ? `${t.msgPhotoLink}: ${link}` : photoAttached ? t.msgPhoto : '',
    t.msgAsk,
    '',
    `${t.msgVia}: ${APP_URL}`,
  ].filter((x, i) => x || i === 6).join('\n');
}

// A smaller copy of the photo (long side 1280 px, under 380 KB) so sending it costs less mobile data.
async function shareablePhoto() {
  const bmp = await createImageBitmap(lastFile, { imageOrientation: 'from-image' });
  let blob;
  for (const [side, q] of [[1280, 0.85], [1024, 0.75], [800, 0.7]]) {
    const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: q });
    if (blob.size < 380 * 1024) break;
  }
  bmp.close();
  return new File([blob], 'ijisho-leaf.jpg', { type: 'image/jpeg' });
}

function setStatus(text) {
  $('agroStatus').textContent = text || '';
  $('agroStatus').hidden = !text;
}

async function loadAgros() {
  agros = [];
  if (!district) { agroState = 'idle'; return renderAgros(); }
  agroState = 'loading';
  renderAgros();
  try {
    const r = await api(`/api/agronomists?district=${encodeURIComponent(district)}`);
    if (!r.ok) throw new Error(String(r.status));
    agros = r.data.agronomists || [];
    localStorage.setItem(LIST_KEY(district), JSON.stringify(agros));
    agroState = 'online';
  } catch {
    const cached = localStorage.getItem(LIST_KEY(district));
    agros = cached ? JSON.parse(cached) : [];
    agroState = cached ? 'offline' : 'none-offline';
  }
  renderAgros();
}

function renderAgros() {
  const t = T[lang];
  setStatus({
    loading: t.loadingAgros,
    offline: t.offlineAgros,
    'none-offline': t.offlineNone,
    online: agros.length ? '' : fill(t.noAgros, { district }),
  }[agroState] || '');
  $('agros').replaceChildren(...agros.map((a) => {
    const li = document.createElement('li');
    li.className = 'agro-card';
    const role = ROLE_LABELS[a.role]?.[lang] || '';
    li.innerHTML = `<div><b></b><span></span></div><button class="btn primary" type="button"></button>`;
    li.querySelector('b').textContent = a.name;
    li.querySelector('span').textContent = [role, a.organisation].filter(Boolean).join(' · ');
    const btn = li.querySelector('button');
    btn.textContent = t.whatsapp;
    btn.addEventListener('click', () => escalate(a, btn));
    return li;
  }));
}

async function escalate(agro, btn) {
  const t = T[lang];
  btn.disabled = true;
  setStatus(t.uploading);
  let link = '';
  try {
    const fd = new FormData();
    fd.set('photo', await shareablePhoto());
    fd.set('result', last.p >= CONFIDENT ? last.cls : 'unsure');
    fd.set('confidence', String(last.p));
    fd.set('lang', lang);
    fd.set('district', district);
    const r = await api('/api/cases', { method: 'POST', form: fd });
    if (!r.ok) throw new Error(String(r.status));
    link = PUBLIC_BASE + r.data.path;
    setStatus('');
  } catch {
    setStatus(t.uploadFailed);
  }
  btn.disabled = false;
  const text = message({ to: agro.name, link });
  location.href = `https://wa.me/${agro.phone}?text=${encodeURIComponent(text)}`;
}

async function shareAnotherWay() {
  const note = $('shareNote');
  note.hidden = true;
  try {
    const photo = lastFile ? await shareablePhoto() : null;
    if (photo && navigator.canShare && navigator.canShare({ files: [photo] })) {
      await navigator.share({ files: [photo], text: message({ photoAttached: true }) });
    } else if (navigator.share) {
      await navigator.share({ text: message({}) });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(message({}))}`, '_blank', 'noopener');
    }
    note.dataset.t = 'shared';
    note.textContent = T[lang].shared;
    note.hidden = false;
  } catch (e) {
    if (e && e.name === 'AbortError') return; // farmer closed the share menu
    console.error(e);
    location.href = `sms:?body=${encodeURIComponent(message({}))}`;
  }
}

function buildDistrictSelect() {
  const sel = $('district');
  const t = T[lang];
  sel.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: t.districtPick }),
    ...Object.entries(PROVINCES).map(([prov, list]) => {
      const g = document.createElement('optgroup');
      g.label = lang === 'rw' ? PROVINCES_RW[prov] : prov;
      g.append(...list.map((d) => Object.assign(document.createElement('option'), { value: d, textContent: d })));
      return g;
    }),
  );
  sel.value = DISTRICTS.includes(district) ? district : '';
}

function renderAsk() {
  $('ask').hidden = false;
  buildDistrictSelect();
  if (agroState === 'idle' && district) loadAgros();
  else renderAgros();
}

$('district').addEventListener('change', (e) => {
  district = e.target.value;
  localStorage.setItem(DISTRICT_KEY, district);
  loadAgros();
});
$('share').addEventListener('click', shareAnotherWay);

applyLang();
const ready = loadModel().catch((e) => {
  console.error(e);
  $('status').textContent = T[lang].error;
});
window.ijisho = { classify, ready }; // used by the automated browser test

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
