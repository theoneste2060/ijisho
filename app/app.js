import { T, CLASSES, RESULTS, CONFIDENT, PARTNER, APP_URL } from './content.js';

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
// Nothing goes through a server: the farmer shares the photo and result with someone they choose.
const AGRO_KEY = 'ijisho-agronomist';
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

function getAgro() {
  try { return JSON.parse(localStorage.getItem(AGRO_KEY)); } catch { return null; }
}

// Accepts 078..., 78..., 250 78..., +250 78... (Rwanda) or any +country number; returns digits for wa.me.
export function normalizePhone(raw) {
  let d = (raw || '').replace(/[^\d+]/g, '');
  const intl = d.startsWith('+');
  d = d.replace(/\+/g, '');
  if (!intl && /^0?7[2389]\d{7}$/.test(d)) d = '250' + d.replace(/^0/, '');
  if (/^2507[2389]\d{7}$/.test(d)) return d;
  if (intl && /^\d{8,15}$/.test(d) && !d.startsWith('250')) return d;
  return null;
}

function resultLine() {
  const t = T[lang];
  if (!last) return '';
  const sure = last.p >= CONFIDENT;
  const name = sure ? RESULTS[last.cls][lang].name : t.msgUnsure;
  return `${t.msgResult}: ${name} (${Math.round(last.p * 100)}%)`;
}

function message(withPhoto) {
  const t = T[lang];
  const now = new Date();
  // Phones have no Kinyarwanda date format, so Kinyarwanda uses day/month/year numbers.
  const date = lang === 'rw'
    ? `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`
    : now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return [`${t.msgIntro} · ${date}`, resultLine(), withPhoto ? t.msgPhoto : '', t.msgAsk, '', `${t.msgVia}: ${APP_URL}`]
    .filter((x, i) => x || i === 4).join('\n');
}

const waLink = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

// A smaller copy of the photo (long side 1280 px) so sending it costs less mobile data.
async function shareablePhoto() {
  const bmp = await createImageBitmap(lastFile, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return new File([blob], 'ijisho-leaf.jpg', { type: 'image/jpeg' });
}

async function shareWithAgronomist() {
  const note = $('shareNote');
  note.hidden = true;
  try {
    const photo = lastFile ? await shareablePhoto() : null;
    if (photo && navigator.canShare && navigator.canShare({ files: [photo] })) {
      await navigator.share({ files: [photo], text: message(true) });
    } else if (navigator.share) {
      await navigator.share({ text: message(false) });
    } else {
      // No share menu (some desktop browsers): WhatsApp lets the farmer pick a contact.
      window.open(`https://wa.me/?text=${encodeURIComponent(message(false))}`, '_blank', 'noopener');
    }
    note.dataset.t = 'shared';
    note.textContent = T[lang].shared;
    note.hidden = false;
  } catch (e) {
    if (e && e.name === 'AbortError') return; // farmer closed the share menu
    console.error(e);
    location.href = `sms:?body=${encodeURIComponent(message(false))}`;
  }
}

function renderAsk() {
  const t = T[lang];
  const agro = getAgro();
  $('ask').hidden = false;
  $('waSaved').hidden = $('waSavedNote').hidden = $('savedRow').hidden = !agro;
  $('addAgro').hidden = !!agro;
  if (agro) {
    $('waSaved').textContent = fill(t.askSaved, { name: agro.name });
    $('waSaved').href = waLink(agro.phone, message(false));
    $('waSavedNote').textContent = fill(t.askSavedNote, { name: agro.name });
    $('savedLabel').textContent = `${agro.name} · +${agro.phone}`;
  }
  $('waPartner').hidden = !PARTNER;
  if (PARTNER) {
    $('waPartner').textContent = fill(t.askSaved, { name: PARTNER.name });
    $('waPartner').href = waLink(PARTNER.whatsapp, message(false));
  }
}

function openForm(open) {
  $('agroForm').hidden = !open;
  $('agroErr').hidden = true;
  if (open) {
    const agro = getAgro();
    $('agroName').value = agro?.name || '';
    $('agroPhone').value = agro ? '+' + agro.phone : '';
    $('agroName').focus();
  }
}

$('share').addEventListener('click', shareWithAgronomist);
$('addAgro').addEventListener('click', () => openForm(true));
$('editAgro').addEventListener('click', () => openForm(true));
$('agroCancel').addEventListener('click', () => openForm(false));
$('removeAgro').addEventListener('click', () => {
  localStorage.removeItem(AGRO_KEY);
  renderAsk();
});
$('agroForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const phone = normalizePhone($('agroPhone').value);
  const name = $('agroName').value.trim() || (lang === 'rw' ? 'Umujyanama' : 'My agronomist');
  if (!phone) {
    $('agroErr').textContent = T[lang].badPhone;
    $('agroErr').hidden = false;
    return;
  }
  localStorage.setItem(AGRO_KEY, JSON.stringify({ name, phone }));
  openForm(false);
  renderAsk();
});

applyLang();
const ready = loadModel().catch((e) => {
  console.error(e);
  $('status').textContent = T[lang].error;
});
window.ijisho = { classify, ready, normalizePhone, message: () => message(true) }; // used by the automated browser test

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
