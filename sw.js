// Service worker: o app abre rápido e funciona sem internet.
// Rede primeiro (sempre a versão mais nova), cache como reserva. A lista CORE é preenchida pelo
// pages.yml a cada publicação (todos os arquivos do site), assim o app funciona offline desde a 1ª visita.
const VERSION = 'ea-dev';
const CORE = ['./', 'index.html', 'app/', 'gestao/', 'usuario/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(CORE.map((p) => c.add(new URL(p, self.registration.scope)).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const proprio = url.origin === self.location.origin;
  if (proprio && url.pathname.endsWith('/version.json')) return;
  if (!proprio && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return; // API do Supabase não passa pelo cache
  e.respondWith((proprio ? fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request)).then((r) => {
    if (r.ok && (r.type === 'basic' || r.type === 'cors')) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
