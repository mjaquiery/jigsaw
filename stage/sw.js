// Generated at build time.
const VERSION = "8667c3cb90db";
const FILES = ["./","assets/index-BxrkComu.css","assets/index-WNzvIUxm.js","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","index.html","manifest.webmanifest"];
const SCOPE = new URL(self.registration.scope);
const CACHE = 'jigsaw:' + SCOPE.pathname + ':' + VERSION;
const STAGE = SCOPE.pathname + 'stage/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new URL(f, SCOPE).href))),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const prefix = 'jigsaw:' + SCOPE.pathname + ':';
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(prefix) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (url.pathname.startsWith(STAGE)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = req.mode === 'navigate' ? new URL('./', SCOPE).href : url.href.split('#')[0];
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (err) {
        const fallback = await cache.match(new URL('./', SCOPE).href);
        if (fallback) return fallback;
        throw err;
      }
    }),
  );
});
