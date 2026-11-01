import { T, CLASSES, RESULTS, CONFIDENT, APP_URL } from './content.js';
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
  if (typeof renderInstall === 'function' && installMode) renderInstall();
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
  closeChooser();
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
  closeChooser();
  $('result').hidden = true;
  $('intro').hidden = false;
});

// ---------- ask an agronomist ----------
// "Ask an agronomist" lists every approved agronomist; the farmer searches and picks one. Tapping WhatsApp uploads
// a smaller copy of the photo (deleted after 30 days) and opens WhatsApp with the result and a link to the photo.
// "Share another way" uses the phone's share menu and uploads nothing.
const LIST_KEY = 'ijisho-agros';
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const fold = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
    resultLine(),
    link ? `${t.msgPhotoLink}: ${link}` : photoAttached ? t.msgPhoto : '',
    t.msgAsk,
    '',
    `${t.msgVia}: ${APP_URL}`,
  ].filter((x, i) => x || i === 5).join('\n');
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
  agroState = 'loading';
  renderAgros();
  try {
    const r = await api('/api/agronomists');
    if (!r.ok) throw new Error(String(r.status));
    agros = r.data.agronomists || [];
    localStorage.setItem(LIST_KEY, JSON.stringify(agros));
    agroState = 'online';
  } catch {
    const cached = localStorage.getItem(LIST_KEY);
    agros = cached ? JSON.parse(cached) : [];
    agroState = cached ? 'offline' : 'none-offline';
  }
  renderAgros();
}

function matches(a, q) {
  if (!q) return true;
  const hay = fold([a.name, a.organisation, (a.districts || []).join(' '), ROLE_LABELS[a.role]?.en, ROLE_LABELS[a.role]?.rw].join(' '));
  return fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function renderAgros() {
  const t = T[lang];
  const q = $('search').value.trim();
  const shown = agros.filter((a) => matches(a, q));
  let status = '';
  if (agroState === 'loading') status = t.loadingAgros;
  else if (agroState === 'none-offline') status = t.offlineNone;
  else if (!agros.length) status = t.noAgros;
  else if (!shown.length) status = fill(t.noMatch, { q });
  else status = (agroState === 'offline' ? t.offlineAgros + ' ' : '') + (shown.length === 1 ? t.countAgro : fill(t.countAgros, { n: shown.length }));
  setStatus(status);
  $('search').closest('label').hidden = agros.length < 2;
  $('agros').replaceChildren(...shown.map((a) => {
    const li = document.createElement('li');
    li.className = 'agro-card';
    li.innerHTML = '<div><b></b><span></span><span class="where"></span></div><button class="btn primary" type="button"></button>';
    li.querySelector('b').textContent = a.name;
    li.querySelector('span').textContent = [ROLE_LABELS[a.role]?.[lang], a.organisation].filter(Boolean).join(' · ');
    li.querySelector('.where').textContent = (a.districts || []).join(', ');
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

function renderAsk() {
  $('ask').hidden = false;
  if (!$('chooser').hidden) renderAgros();
}

function closeChooser() {
  $('chooser').hidden = true;
  $('askBtn').hidden = false;
  $('askBtn').setAttribute('aria-expanded', 'false');
  $('search').value = '';
}

$('askBtn').addEventListener('click', () => {
  $('chooser').hidden = false;
  $('askBtn').hidden = true;
  $('askBtn').setAttribute('aria-expanded', 'true');
  loadAgros();
});
$('search').addEventListener('input', renderAgros);
$('share').addEventListener('click', shareAnotherWay);

// ---------- install ----------
// Shown only to people who have not installed Ijisho. Chrome and Edge give a real install prompt; iPhones and
// some browsers have none, so the card explains where to tap instead.
let installPrompt = null;
let installMode = null; // 'prompt' | 'ios' | 'menu'
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

function renderInstall() {
  const t = T[lang];
  const show = !!installMode && !isInstalled();
  $('install').hidden = !show;
  if (!show) return;
  $('installBtn').textContent = installMode === 'prompt' ? t.installBtn : t.howBtn;
  $('installBtn').hidden = installMode !== 'prompt' && !$('installSteps').hidden;
  $('installSteps').textContent = installMode === 'ios' ? t.iosSteps : t.menuSteps;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // keep the browser's own mini-bar away; we show our button instead
  installPrompt = e;
  installMode = 'prompt';
  renderInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installMode = null;
  renderInstall();
});
$('installBtn').addEventListener('click', async () => {
  if (installMode === 'prompt' && installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    if (outcome === 'accepted') installMode = null;
    renderInstall();
    return;
  }
  $('installSteps').hidden = false;
  renderInstall();
});
if (!isInstalled()) {
  if (isIOS()) installMode = 'ios';
  // Browsers that support the prompt fire it quickly; on other phones, explain the menu instead.
  else if (isMobile()) setTimeout(() => { if (!installMode) { installMode = 'menu'; renderInstall(); } }, 4000);
}

applyLang();
renderInstall();
const ready = loadModel().catch((e) => {
  console.error(e);
  $('status').textContent = T[lang].error;
});
window.ijisho = { classify, ready }; // used by the automated browser test

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
