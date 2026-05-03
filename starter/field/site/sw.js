// Service worker — offline-first behaviour for the field companion.
//
// Three caching strategies:
//   - Shell (HTML, root):     network-first with cache fallback
//   - /api/*:                 stale-while-revalidate (cached returns immediately, fresh refreshes in background)
//   - Other GETs:             pass through (no caching)
//
// POST/PATCH requests are never cached and never intercepted — they
// just go to the network. When you're offline, journal saves will
// fail; the SPA can queue them in localStorage and retry, but that's
// out of scope for this starter.

const SHELL_VERSION = 'sidebar-field-shell-v1';
const API_CACHE     = 'sidebar-field-api-v1';

const SHELL_FILES = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_VERSION);
    await Promise.all(SHELL_FILES.map(f => cache.add(f).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_VERSION, API_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // /api/* — stale-while-revalidate.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      const cached = await cache.match(event.request);
      const networkPromise = fetch(event.request).then(res => {
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await networkPromise) || new Response('offline', { status: 503 });
    })());
    return;
  }

  // Shell — network-first, cache fallback.
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(event.request);
        if (res.ok) {
          const cache = await caches.open(SHELL_VERSION);
          cache.put(event.request, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(event.request);
        return cached
          || (await caches.match('/index.html'))
          || new Response('offline', { status: 503 });
      }
    })());
  }
});
