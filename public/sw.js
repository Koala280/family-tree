const CACHE_NAME = 'family-tree-cache-v4';
const SHARE_TARGET_PATH = '/share-target';
const SHARED_IMPORT_CACHE_PATH = '/__shared-tree-import__.json';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg'
];

const handleShareTarget = async (request) => {
  try {
    const formData = await request.formData();
    const sharedFile = formData.get('treeFile');

    if (sharedFile && typeof sharedFile.text === 'function') {
      const rawText = await sharedFile.text();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        SHARED_IMPORT_CACHE_PATH,
        new Response(rawText, {
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    }
  } catch (error) {
    // Ignore malformed payloads and continue to app shell.
  }

  return Response.redirect('/?shareImport=1', 303);
};

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
