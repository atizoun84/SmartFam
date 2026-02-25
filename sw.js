// sw.js - Service Worker pour Trésorerie Familiale
const CACHE_NAME = 'tresorerie-familiale-v1.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './config.html',
  './paiements.html',
  './comptabilite.html',
  './messages.html',
  './documents.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Installation du Service Worker - mise en cache des ressources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation en cours...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
    .then((cache) => {
      console.log('[Service Worker] Mise en cache des ressources');
      return cache.addAll(ASSETS_TO_CACHE);
    })
    .then(() => {
      console.log('[Service Worker] Installation terminée');
      return self.skipWaiting(); // Active immédiatement le nouveau SW
    })
  );
});

// Activation - nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation en cours...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Suppression de l\'ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Activation terminée, prise de contrôle');
      return self.clients.claim(); // Prend le contrôle des clients ouverts
    })
  );
});

// Stratégie : Cache First puis réseau
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET et les requêtes vers des API externes
  if (event.request.method !== 'GET') return;
  
  // Pour les requêtes vers des ressources externes (CDN), on utilise une stratégie spécifique
  const url = new URL(event.request.url);
  
  // Stratégie pour les ressources externes (CDN)
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Retourne la ressource en cache si disponible
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Sinon, va chercher sur le réseau et met en cache pour la prochaine fois
        return fetch(event.request).then((networkResponse) => {
          // Vérifie si la réponse est valide
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          
          // Clone la réponse pour la mettre en cache
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          
          return networkResponse;
        }).catch(() => {
          // En cas d'échec réseau, retourne une page d'erreur personnalisée
          console.log('[Service Worker] Échec de chargement de la ressource externe:', event.request.url);
          return caches.match('./index.html');
        });
      })
    );
    return;
  }
  
  // Stratégie pour les ressources locales (Cache First)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Retourne la ressource en cache si disponible
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Sinon, va chercher sur le réseau
      return fetch(event.request).then((networkResponse) => {
        // Vérifie si la réponse est valide
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        
        // Clone la réponse pour la mettre en cache
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      }).catch((error) => {
        console.error('[Service Worker] Erreur de fetch:', error);
        
        // Si la requête est pour une page HTML, retourne la page d'accueil
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
        
        return new Response('Ressource non disponible hors ligne', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      });
    })
  );
});

// Gestion des messages (pour synchronisation)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background Sync pour les paiements en mode hors ligne (optionnel)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-paiements') {
    console.log('[Service Worker] Synchronisation des paiements en cours...');
    event.waitUntil(
      // Récupère les paiements en attente et les synchronise
      syncPendingPaiements()
    );
  }
});

// Fonction de synchronisation (à implémenter selon les besoins)
async function syncPendingPaiements() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_PAIEMENTS',
        message: 'Synchronisation des paiements en attente'
      });
    });
    return Promise.resolve();
  } catch (error) {
    console.error('[Service Worker] Erreur de synchronisation:', error);
    return Promise.reject(error);
  }
}