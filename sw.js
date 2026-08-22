// Service worker : met en cache les icônes (statiques, ne changent jamais)
// pour un chargement instantané, mais va TOUJOURS chercher index.html et
// manifest.json sur le réseau en priorité (avec le cache seulement en
// secours hors-ligne). Sans ça, une fois le service worker installé, le
// navigateur resservirait indéfiniment l'ancienne version de l'appli même
// après une mise à jour du code — le fichier data.json n'est lui jamais
// mis en cache, il doit toujours être frais.

const CACHE_NAME = 'behoop-shell-v3';
const FICHIERS_STATIQUES = [
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS_STATIQUES))
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

  // Pour la page et les fichiers texte : réseau d'abord (toujours la
  // dernière version), cache seulement si le réseau est indisponible
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copie));
          return reponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Pour le reste (icônes statiques) : cache d'abord, réseau en secours
  event.respondWith(
    caches.match(event.request).then((reponse) => reponse || fetch(event.request))
  );
});
