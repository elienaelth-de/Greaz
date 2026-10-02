/* ═══ Greaz — Service Worker ═══
   Permet à la page d'être "installable" (icône sur l'écran d'accueil,
   ouverture en plein écran comme une vraie app) et garde une version
   de secours en cache pour un chargement quasi-instantané / hors-ligne
   partiel. On ne met en cache QUE les fichiers du site lui-même —
   jamais les appels Firebase/EmailJS, pour ne jamais servir de données
   clients périmées. */

var CACHE_NAME = 'greaz-shell-v4';
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

// ═══ Notifications push — reçues même quand l'app est complètement
// fermée. Le serveur (fonction Supabase "send-push") envoie un message
// chiffré ; c'est ce code qui l'affiche comme une vraie notification. ═══
self.addEventListener('push', function(event){
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e){}
  var title = data.title || '🔧 Greaz';
  var body = data.body || 'Nouvelle activité sur ton compte Greaz.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'greaz-client-push-' + Date.now(),
      data: { tab: data.tab || '' }
    })
  );
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var targetUrl = './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList){
      for (var i = 0; i < clientList.length; i++){
        var c = clientList[i];
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
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
    // { cache: 'no-store' } est essentiel ici : sans ça, "fetch premier"
    // peut quand même recevoir une copie périmée depuis le cache HTTP du
    // navigateur (ou d'un CDN en avant de l'hébergement) au lieu d'aller
    // vraiment chercher la dernière version — c'est ce qui faisait rester
    // l'app figée sur une vieille version côté ordinateur, même après un
    // rafraîchissement normal.
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(function(res){
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
      var network = fetch(req, { cache: 'no-store' }).then(function(res){
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
