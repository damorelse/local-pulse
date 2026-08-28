/**
 * Local Pulse — PWA Service Worker
 * Implements Cache-First static app shell caching + Network-First dynamic API caching
 * with offline fallback to pre-bundled data/benchmarks.json matrix.
 */

const STATIC_CACHE = 'localpulse-v1-static';
const DYNAMIC_CACHE = 'localpulse-v1-dynamic';

const STATIC_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/css/leaflet.css',
  '/js/app.js',
  '/js/config.js',
  '/js/geocoding.js',
  '/js/census.js',
  '/js/environment.js',
  '/js/wikipedia.js',
  '/js/calculations.js',
  '/js/charts.js',
  '/js/map.js',
  '/js/storage.js',
  '/js/compare.js',
  '/js/share.js',
  '/js/theme.js',
  '/data/benchmarks.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// 1. Install Event — Pre-cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      console.log('[SW] Pre-caching static app shell');
      for (const url of STATIC_SHELL) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn(`[SW] Pre-cache item failed (${url}):`, err.message);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event — Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event — Cache-First for static assets, Network-First for APIs
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') {
    return;
  }

  // Handle Chrome extension schemes or other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;

  // Strategy A: Cache-First for Static App Shell & Benchmarks
  if (isSameOrigin && (
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.webmanifest')
  )) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Return cached and update in background (Stale-While-Revalidate)
          fetch(req).then((networkRes) => {
            if (networkRes && networkRes.ok) {
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, networkRes));
            }
          }).catch(() => {});
          return cached;
        }

        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        }).catch(() => {
          if (url.pathname.endsWith('.json')) {
            return caches.match('/data/benchmarks.json');
          }
          return caches.match('/index.html');
        });
      })
    );
    return;
  }

  // Strategy B: Network-First with Cache Fallback for Public Data APIs & Map Tiles
  // (FCC, Census ACS, Open-Meteo, Wikipedia, OSM Nominatim, CartoDB Tiles)
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      })
      .catch(async () => {
        console.log(`[SW] Network failed for ${req.url}, attempting cache fallback`);
        const cached = await caches.match(req);
        if (cached) {
          return cached;
        }

        // If Census ACS API query fails offline, fallback to bundled benchmarks
        if (url.hostname.includes('census.gov') || url.hostname.includes('fcc.gov')) {
          const benchmarkFallback = await caches.match('/data/benchmarks.json');
          if (benchmarkFallback) {
            return benchmarkFallback;
          }
        }

        // Return empty JSON fallback for API errors
        return new Response(JSON.stringify({ error: 'Offline mode', offline: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
          statusText: 'Service Unavailable (Offline)'
        });
      })
  );
});
