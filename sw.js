/* ═══ Greaz — Service Worker ═══
   Permet à la page d'être "installable" (icône sur l'écran d'accueil,
   ouverture en plein écran comme une vraie app) et garde une version
   de secours en cache pour un chargement quasi-instantané / hors-ligne
   partiel. On ne met en cache QUE les fichiers du site lui-même —
   jamais les appels Firebase/EmailJS, pour ne jamais servir de données
   clients périmées. */

var CACHE_NAME = 'greaz-shell-v3';
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

  // La PAGE elle-même (navigation) : toujours essayer le réseau EN PREMIER,
  // pour que tes mises à jour soient visibles tout de suite dans l'app
  // installée sur le téléphone. Le cache ne sert que de filet si jamais
  // le téléphone est hors-ligne au moment d'ouvrir l'app.
  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req).then(function(res){
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, clone); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){ return cached || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Le reste (icônes, manifest...) : cache d'abord pour la vitesse, avec
  // mise à jour silencieuse en arrière-plan.
  event.respondWith(
    caches.match(req).then(function(cached){
      var network = fetch(req).then(function(res){
        if(res && res.status === 200){
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, clone); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
