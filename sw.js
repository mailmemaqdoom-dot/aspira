/*
 * ASPIRA Service Worker — v1
 * ─────────────────────────────────────────────────────────────────
 * Strategy:
 *   Navigation requests  → network-first, fallback to cached shell
 *   Image assets         → cache-first, background revalidation
 *   All other GET        → stale-while-revalidate
 *   Cross-origin / POST  → network-only (pass-through)
 *
 * Cache name includes version — bump to invalidate on deploy.
 */

const CACHE_NAME  = 'aspira-v1';
const SHELL_URLS  = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json'
];

/* ── Install: precache app shell ── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(SHELL_URLS); })
      .then(function() { return self.skipWaiting(); })
  );
});

/* ── Activate: remove stale caches ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

/* ── Fetch: smart cache strategy ── */
self.addEventListener('fetch', function(event) {
  var req = event.request;
  var url = new URL(req.url);

  /* Pass through: non-GET, cross-origin, or dev tools */
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/sw.js')) return;

  /* Navigation (HTML pages): network-first → shell fallback */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
          return response;
        })
        .catch(function() {
          return caches.match('/index.html');
        })
    );
    return;
  }

  /* Images: cache-first, background network update */
  var isImage = /\.(png|jpg|jpeg|webp|avif|gif|svg)(\?.*)?$/i.test(url.pathname);
  if (isImage) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(req).then(function(cached) {
          /* Background revalidation */
          var fetchFresh = fetch(req).then(function(response) {
            cache.put(req, response.clone());
            return response;
          });
          return cached || fetchFresh;
        });
      })
    );
    return;
  }

  /* Everything else: stale-while-revalidate */
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req).then(function(cached) {
        var fresh = fetch(req).then(function(response) {
          if (response && response.status === 200) {
            cache.put(req, response.clone());
          }
          return response;
        }).catch(function() {
          return cached; /* network failed, return cached if available */
        });
        return cached || fresh;
      });
    })
  );
});
