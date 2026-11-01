import { T, CLASSES, RESULTS, CONFIDENT, APP_URL } from './content.js';

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
// (sx, sy, sw, sh) picks a part of the photo; by default the whole photo.
function toTensor(bmp, sx = 0, sy = 0, sw = bmp.width, sh = bmp.height) {
  const scale = 256 / Math.min(sw, sh);
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = new OffscreenCanvas(224, 224);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, (224 - w) / 2, (224 - h) / 2, w, h);
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

async function probsOf(bmp, ...region) {
  const out = await session.run({ image: toTensor(bmp, ...region) });
  return softmax(Array.from(out.logits.data));
}

const NOT_BEAN = CLASSES.indexOf('not_bean');

// Parts of the photo to look at again: centre 70% and four overlapping corners at 60% of the short side.
function zoomRegions(w, h) {
  const out = [];
  for (const [frac, spots] of [[0.7, [[0.5, 0.5]]], [0.6, [[0, 0], [1, 0], [0, 1], [1, 1]]]]) {
    const s = frac * Math.min(w, h);
    for (const [fx, fy] of spots) out.push([(w - s) * fx, (h - s) * fy, s, s]);
  }
  return out;
}

// Look at the whole photo. Only if that says "not a bean leaf" (for example a whole trifoliate leaf or a plant
// photographed from further away), zoom into five parts; if one clearly shows a bean leaf, answer from it.
export async function classify(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const probs = await probsOf(bmp);
    let best = probs.indexOf(Math.max(...probs));
    let result = { cls: CLASSES[best], p: probs[best], probs, zoomed: false };
    if (best === NOT_BEAN) {
      for (const region of zoomRegions(bmp.width, bmp.height)) {
        const q = await probsOf(bmp, ...region);
        const c = q.indexOf(Math.max(...q));
        if (c !== NOT_BEAN && q[c] >= CONFIDENT && q[NOT_BEAN] < 0.15 && (!result.zoomed || q[c] > result.p)) {
          result = { cls: CLASSES[c], p: q[c], probs: q, zoomed: true };
        }
      }
    }
    return result;
  } finally {
    bmp.close();
  }
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
// Opens the phone's share menu with a smaller copy of the photo and a ready message, so the farmer sends it to
// their own agronomist or farmer promoter (WhatsApp, SMS…). Nothing goes through a server.
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

function message(photoAttached) {
  const t = T[lang];
  return [`${t.msgIntro} · ${today()}`, resultLine(), photoAttached ? t.msgPhoto : '', t.msgAsk, '', `${t.msgVia}: ${APP_URL}`]
    .filter((x, i) => x || i === 4).join('\n');
}

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

async function askAgronomist() {
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
  $('ask').hidden = false;
}

$('share').addEventListener('click', askAgronomist);

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
