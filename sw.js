/**
 * @file sw.js
 * @description Service Worker для офлайн-режиму PWA «Розмінування України».
 * Оболонка (HTML/JS/CSS) і JSON-дані кешуються окремо — контент оновлюється
 * через network-first без зміни CACHE_VERSION оболонки.
 */

const SHELL_CACHE = 'eore-ua-shell-v14';
const DATA_CACHE = 'eore-ua-data-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './object.html',
  './model.html',
  './glossary.html',
  './imas.html',
  './manifest.json',
  './css/main.css',
  './js/app.js',
  './js/object-page.js',
  './js/model-page.js',
  './js/stl-viewer.js',
  './js/glossary.js',
  './js/imas.js',
  './js/loader.js',
  './js/search.js',
  './js/filters.js',
  './js/accordion.js',
  './js/gallery.js',
  './js/theme.js',
  './js/router.js',
  './js/storage.js',
  './js/updates.js',
  './vendor/three/three.module.min.js',
  './vendor/three/OrbitControls.js',
  './vendor/three/GLTFLoader.js',
  './vendor/three/toTrianglesDrawMode.js',
  './vendor/three/STLLoader.js',
  './img/logo.svg',
  './img/logo.png',
];

const CORE_DATA = [
  './data/index.json',
  './data/abbreviations.json',
  './data/imas/index.json',
  './data/imas/docs/08.10.json',
  './data/imas/docs/08.20.json',
  './data/imas/docs/09.10.json',
  './data/imas/docs/09.11.json',
  './data/imas/docs/09.13.json',
  './data/imas/docs/09.30.json',
  './data/imas/docs/09.31.json',
  './data/imas/docs/10.10.json',
  './data/imas/docs/10.20.json',
  './data/indexes/mines.json',
  './data/indexes/cluster.json',
  './data/indexes/artillery.json',
  './data/indexes/rockets.json',
  './data/indexes/missiles.json',
  './data/indexes/aerial-bombs.json',
  './data/indexes/grenades.json',
  './data/indexes/rpg.json',
  './data/indexes/mortar.json',
  './data/indexes/fuzes.json',
  './data/indexes/ied.json',
  './data/indexes/uav.json',
];

/**
 * Встановлення SW і попереднє кешування ядра.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(CORE_ASSETS);

      const data = await caches.open(DATA_CACHE);
      await Promise.all(
        CORE_DATA.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-store' });
            if (response.ok) await data.put(url, response);
          } catch (error) {
            console.warn('SW precache data failed', url, error);
          }
        }),
      );

      await self.skipWaiting();
    })(),
  );
});

/**
 * Активація: видаляє застарілі кеші оболонки/даних інших версій.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, DATA_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !keep.has(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Повідомлення від клієнта: очистити кеш JSON / форсувати активацію.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'CLEAR_DATA_CACHE') {
    event.waitUntil(
      (async () => {
        await caches.delete(DATA_CACHE);
        await caches.open(DATA_CACHE);
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: true });
        }
      })(),
    );
  }

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * Стратегії:
 * - JSON: network-first (no-store) → data-кеш
 * - HTML/JS/CSS: network-first → shell-кеш
 * - медіа: cache-first з фоновим оновленням
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isJSON = url.pathname.endsWith('.json');
  const isMedia = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|pdf|stl|glb|gltf)$/i.test(url.pathname);

  if (isJSON) {
    event.respondWith(networkFirst(request, DATA_CACHE, { bustHttpCache: true }));
    return;
  }

  if (isMedia) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE));
});

/**
 * Cache-first стратегія.
 * @param {Request} request
 * @param {string} cacheName
 * @returns {Promise<Response>}
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    fetchAndCache(request, cacheName);
    return cached;
  }
  return fetchAndCache(request, cacheName);
}

/**
 * Network-first стратегія.
 * @param {Request} request
 * @param {string} cacheName
 * @param {{bustHttpCache?: boolean}} [options]
 * @returns {Promise<Response>}
 */
async function networkFirst(request, cacheName, options = {}) {
  try {
    return await fetchAndCache(request, cacheName, options);
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const indexPage = await caches.match('./index.html');
      if (indexPage) return indexPage;
    }
    throw error;
  }
}

/**
 * Завантажує ресурс і кладе в кеш.
 * @param {Request} request
 * @param {string} cacheName
 * @param {{bustHttpCache?: boolean}} [options]
 * @returns {Promise<Response>}
 */
async function fetchAndCache(request, cacheName, options = {}) {
  const init = options.bustHttpCache
    ? { cache: 'no-store' }
    : undefined;
  const response = await fetch(request, init);
  if (response && response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}
