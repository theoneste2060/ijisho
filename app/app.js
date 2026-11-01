import { T, CLASSES, RESULTS, CONFIDENT } from './content.js';

const $ = (id) => document.getElementById(id);
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
// Saved choice first, otherwise Kinyarwanda for phones set to Kinyarwanda.
let lang = localStorage.getItem('ijisho-lang') || ((navigator.language || '').startsWith('rw') ? 'rw' : 'en');
let session;
let last; // last prediction, so switching language re-renders it

// ---------- language ----------
function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) {
    const key = el.dataset.t;
    if (key === 'loading' && session) continue;
    if (T[lang][key]) el.textContent = T[lang][key];
  }
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
}

async function handle(file) {
  if (!file) return;
  $('intro').hidden = true;
  $('result').hidden = false;
  $('answer').hidden = true;
  $('checking').hidden = false;
  $('checking').textContent = T[lang].checking;
  $('preview').src = URL.createObjectURL(file);
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
  $('result').hidden = true;
  $('intro').hidden = false;
});

applyLang();
const ready = loadModel().catch((e) => {
  console.error(e);
  $('status').textContent = T[lang].error;
});
window.ijisho = { classify, ready }; // used by the automated browser test

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
