// Service worker minimal : met en cache la "coquille" de l'appli (HTML/icônes)
// pour un chargement instantané et pour satisfaire les critères d'installabilité
// PWA. IMPORTANT : data.json n'est JAMAIS mis en cache ici — on veut toujours
// les données les plus fraîches, jamais une version figée.

const CACHE_NAME = 'basket-hainaut-shell-v1';
const FICHIERS_COQUILLE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS_COQUILLE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(noms.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jamais de cache pour les données (JSON) ou les agendas (.ics) : toujours frais
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.ics')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Pour le reste (coquille de l'appli) : cache d'abord, réseau en secours
  event.respondWith(
    caches.match(event.request).then((reponse) => reponse || fetch(event.request))
  );
});
