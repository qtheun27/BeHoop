// Service worker de l'appli (/app/) : coquille en cache, réseau d'abord pour les pages,
// jamais de cache pour les données ; réception des notifications FCM.
const CACHE = 'behoop-app-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('.json')) return; // données toujours fraîches
  if (u.pathname.startsWith('/app/assets/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return res; })));
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return res; }).catch(() => caches.match(e.request)));
  }
});
// Notifications push (format FCM « data » ou « notification »)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { notification: { title: 'BeHoop', body: e.data && e.data.text() } }; }
  const n = d.notification || d.data || {};
  const data = d.data || {};
  e.waitUntil(self.registration.showNotification(n.title || 'BeHoop', { body: n.body || '', icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', tag: data.tag, data }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app/#/fil';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => { for (const c of cs) if (c.url.includes('/app/')) { c.navigate(url); return c.focus(); } return self.clients.openWindow(url); }));
});
