// ══════════════════════════════════════════════════════════════
// SyndicPro Service Worker — PWA Phase 3
// ══════════════════════════════════════════════════════════════

const CACHE_NAME = 'syndicpro-v2';
const STATIC_ASSETS = [
  '/',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Fraunces:ital,wght@0,300;0,600;1,300&display=swap',
];

// Installation — mise en cache des assets statiques
self.addEventListener('install', e => {
  console.log('[SW] Installing...');
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Failed to cache:', url, err.message)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activation — nettoyage ancien cache
self.addEventListener('activate', e => {
  console.log('[SW] Activating...');
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — stratégie hybride
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET et les API en lecture seule
  if (request.method !== 'GET') return;

  // API calls — Network First avec fallback cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Assets statiques — Cache First
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    e.respondWith(cacheFirst(request));
    return;
  }

  // Navigation (pages HTML) — Network First
  if (request.mode === 'navigate') {
    e.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Défaut — Stale While Revalidate
  e.respondWith(staleWhileRevalidate(request));
});

// ── Stratégies de cache ──────────────────────────────────────

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      // Ne pas cacher les mutations API
      if (!request.url.includes('/api/')) {
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback offline pour les API
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Offline', message: 'Connexion indisponible' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Fallback page principale pour la navigation
    return caches.match('/') || new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset unavailable offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await networkPromise || new Response('Offline', { status: 503 });
}

// ── Push Notifications ───────────────────────────────────────

self.addEventListener('push', e => {
  if (!e.data) return;
  let data;
  try { data = e.data.json(); }
  catch { data = { title: 'SyndicPro', body: e.data.text() }; }

  const { title = 'SyndicPro', body = '', icon = '/icon-192.png', badge = '/icon-192.png', url = '/', tag, data: extra } = data;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: tag || 'syndicpro-' + Date.now(),
      vibrate: [100, 50, 100],
      data: { url, ...extra },
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Background Sync ──────────────────────────────────────────
// Synchroniser les actions en attente quand la connexion revient
self.addEventListener('sync', e => {
  if (e.tag === 'sync-declarations') {
    e.waitUntil(syncPendingDeclarations());
  }
});

async function syncPendingDeclarations() {
  // Les déclarations sauvegardées localement seront envoyées
  const pending = await getPendingFromIDB('pending-declarations');
  for (const item of pending) {
    try {
      await fetch('/api/charges/paiements/' + item.id + '/payer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + item.token },
        body: JSON.stringify(item.data),
      });
    } catch(err) { console.warn('[SW] Sync failed:', err); }
  }
}

async function getPendingFromIDB(storeName) {
  // Simple wrapper IndexedDB
  return new Promise((resolve) => {
    const req = indexedDB.open('syndicpro-offline', 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) { resolve([]); return; }
      const tx = db.transaction(storeName, 'readonly');
      tx.objectStore(storeName).getAll().onsuccess = (e) => resolve(e.target.result || []);
    };
    req.onerror = () => resolve([]);
  });
}
