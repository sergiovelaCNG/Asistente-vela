// Despacho V6 · service worker. Guarda la carcasa completa (también la librería de Supabase y las tipografías, que ahora van en la
// propia carpeta) para que la app abra sin cobertura. Los datos vienen de Supabase; el último estado lo guarda la propia app.
const CACHE = 'despacho-v26';
const SHELL = ["./", "./index.html", "./app.js", "./vendor/supabase.js", "./manifest.webmanifest", "./escudo.png", "./logo-color.png", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./fonts/ibm-plex-mono-latin-500-normal.woff2", "./fonts/newsreader-latin-400-normal.woff2", "./fonts/newsreader-latin-500-normal.woff2", "./fonts/schibsted-grotesk-latin-400-normal.woff2", "./fonts/schibsted-grotesk-latin-500-normal.woff2", "./fonts/schibsted-grotesk-latin-600-normal.woff2", "./fonts/schibsted-grotesk-latin-700-normal.woff2"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.indexOf('despacho-') === 0 && k.indexOf('despacho-v6-') !== 0 && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Tipografías, librería e imágenes: primero la copia guardada. Lo demás (index.html, app.js): primero la red, con 4 s de margen,
// para ver siempre la última versión; si no hay red, la copia guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const guardar = (r) => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; };
  if (/\/(fonts|vendor)\/|\.png$/.test(url.pathname)) { e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then(guardar))); return; }
  e.respondWith(new Promise((resolve) => {
    let hecho = false; const fin = (r) => { if (!hecho && r) { hecho = true; resolve(r); } };
    const copia = () => caches.match(e.request).then((r) => r || caches.match('./index.html'));
    const t = setTimeout(() => copia().then(fin), 4000);
    fetch(e.request).then((r) => { clearTimeout(t); guardar(r); fin(r); }).catch(() => { clearTimeout(t); copia().then((r) => { fin(r || Response.error()); }); });
  }));
});
// Avisos: se activan en la fase 2, cuando exista el servidor de avisos.
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Despacho', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: d.url || './' }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data || './')); });
