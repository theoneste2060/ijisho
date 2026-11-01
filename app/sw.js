// Caches everything on first visit so Ijisho works with no connection afterwards.
// Bump VERSION whenever any cached file changes.
const VERSION = 'ijisho-v6';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'content.js',
  'districts.js',
  'api.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'model/ijisho-beans.onnx',
  'vendor/ort.wasm.min.js',
  'vendor/ort-wasm-simd-threaded.wasm',
  'vendor/ort-wasm-simd-threaded.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first: the app never needs the network once installed.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
