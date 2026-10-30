import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * After the build, write dist/sw.js: a cache-first service worker that
 * precaches every built file so the game runs offline once loaded.
 *
 * The same origin hosts the released build at the site root and a preview
 * build under stage/, so each copy only handles requests inside its own
 * scope and never touches the nested stage/ folder.
 */
export function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'jigsaw-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && f !== '.nojekyll');
      const hash = createHash('sha256');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      writeFileSync(join(outDir, 'sw.js'), swSource(version, ['./', ...files]));
    },
  };
}

function swSource(version: string, files: string[]): string {
  return `// Generated at build time.
const VERSION = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};
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
`;
}
