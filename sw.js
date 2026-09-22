/* ═══ Greaz — Service Worker ═══
   Permet à la page d'être "installable" (icône sur l'écran d'accueil,
   ouverture en plein écran comme une vraie app) et garde une version
   de secours en cache pour un chargement quasi-instantané / hors-ligne
   partiel. On ne met en cache QUE les fichiers du site lui-même —
   jamais les appels Firebase/EmailJS, pour ne jamais servir de données
   clients périmées. */

var CACHE_NAME = 'greaz-shell-v1';
var CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){ return cache.addAll(CORE_ASSETS); })
      .catch(function(){ /* si un fichier manque, on n'échoue pas l'install */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;

  // On ne touche jamais aux appels vers d'autres domaines (Firebase,
  // EmailJS, polices, cartes, Stripe...) — ils passent directement au réseau.
  if(!req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(req).then(function(cached){
      var network = fetch(req).then(function(res){
        if(res && res.status === 200){
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, clone); });
        }
        return res;
      }).catch(function(){ return cached; });
      // Cache d'abord pour la vitesse, réseau en secours (et mise à jour silencieuse du cache)
      return cached || network;
    })
  );
});
