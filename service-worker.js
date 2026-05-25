// service-worker.js — cache app shell + Human models + vendor
// All paths are relative to the SW location so the app works
// regardless of deployment subpath (root, GH Pages, or internal nested).
const VERSION = 'v11';
const CACHE_APP = `app-shell-${VERSION}`;
const CACHE_MODELS = `human-models-${VERSION}`;

const APP_SHELL = [
  './',
  './admin.html',
  './example-checkin.html',
  './example-alert.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './shared/face-store.js',
  './shared/face-store-schema.js',
  './shared/face-store-tuning.js',
  './shared/face-store-people.js',
  './shared/face-store-events.js',
  './shared/face-store-watchlists.js',
  './shared/face-store-opfs.js',
  './shared/face-store-accumulate.js',
  './shared/face-store-match.js',
  './shared/face-store-ops.js',
  './shared/face-store-gc.js',
  './shared/face-store-export.js',
  './shared/face-store-import.js',
  './shared/face-engine.js',
  './shared/face-quality.js',
  './shared/face-ui.js',
  './shared/face-ui.css',
  './shared/tokens.css',
  './shared/face-worker.js',
  './shared/face-worker-logic.js',
  './shared/face-checkin-template.js',
  './shared/face-alert-template.js',
  './shared/single-tab-lock.js',
  './shared/persistent-storage.js',
  './shared/sw-register.js',
  './shared/util-ulid.js',
  './shared/util-cosine.js',
  './shared/admin/admin-shell.js',
  './shared/admin/admin-tab-people.js',
  './shared/admin/admin-tab-events.js',
  './shared/admin/admin-tab-watchlists.js',
  './shared/admin/admin-tab-tuning.js',
  './shared/admin/admin-tab-system.js',
  './shared/admin/admin.css',
  './vendor/idb/idb.min.js',
  './vendor/fflate/fflate.module.js',
  './vendor/human/human.esm.js',
  './configs/example-checkin.json',
  './configs/example-watchlist.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    await cache.addAll(APP_SHELL.map(u => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Human library 模型: cache-first + 背景填入。pathname 用 includes 以兼容子路徑部署
  if (url.pathname.includes('/vendor/human/models/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_MODELS);
      const cached = await cache.match(e.request);
      if (cached) return cached;
      const fresh = await fetch(e.request);
      cache.put(e.request, fresh.clone());
      return fresh;
    })());
    return;
  }
  // app shell: cache-first
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      return await fetch(e.request);
    } catch {
      return new Response('Offline', { status: 503 });
    }
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
