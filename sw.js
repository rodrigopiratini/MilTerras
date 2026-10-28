// Service worker: o app abre instantaneamente e funciona offline (cache do app + rede para fontes)
const VERSION = 'mt-v5';
const CORE = [
  './', 'index.html', 'gestor/', 'gestor/index.html', 'gestor/manifest.webmanifest', 'cliente/', 'cliente/index.html', 'cliente/manifest.webmanifest',
  'src/css/app.css',
  'src/js/core/fmt.js', 'src/js/core/store.js', 'src/js/core/seed.js', 'src/js/core/catalogo.js', 'src/js/core/domain.js', 'src/js/core/ui.js', 'src/js/core/charts.js', 'src/js/core/fechamento-ui.js',
  'src/js/gestor/app.js', 'src/js/cliente/app.js', 'src/js/config.js', 'src/js/core/cloud.js', 'src/vendor/supabase.js',
  'assets/logo/logo_v_negativo.png', 'assets/icons/icon-512.png', 'assets/icons/icon-cliente-512.png',
  'assets/logo/logo_h.png', 'assets/logo/logo_h_negativo.png', 'assets/logo/logo_v.png', 'assets/logo/simbolo.png', 'assets/logo/simbolo_negativo.png',
  'assets/icons/icon-192.png', 'assets/icons/icon-cliente-192.png', 'assets/icons/apple-touch-icon.png', 'assets/icons/apple-touch-icon-cliente.png',
  "assets/vinhos/amarone.webp",
  "assets/vinhos/barolo.webp",
  "assets/vinhos/brunello.webp",
  "assets/vinhos/ceius.webp",
  "assets/vinhos/lito.webp",
  "assets/vinhos/lux-clara.webp",
  "assets/vinhos/mitasus.webp",
  "assets/vinhos/odone.webp",
  "assets/vinhos/primitivo-manduria.webp",
  "assets/vinhos/publia.webp",
  "assets/vinhos/rianus.webp",
  "assets/vinhos/rufia.webp",
  "assets/vinhos/sativus.webp",
  "assets/vinhos/vignadura.webp",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE.map((p) => new URL(p, self.registration.scope)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (sempre a versão mais nova), cache como reserva offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && (r.type === 'basic' || r.type === 'cors')) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
