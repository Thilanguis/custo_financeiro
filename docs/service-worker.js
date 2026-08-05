// docs/service-worker.js
const CACHE_NAME = 'controle-financeiro-v69';
const urlsToCache = ['./', './index.html', './style.css', './app.js', './firebase-api.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Ignora o cache HTTP durante a instalação para não copiar arquivos antigos
      // para o cache recém-criado do aplicativo.
      .then((cache) => cache.addAll(urlsToCache.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// A nova versão só assume quando o usuário confirma no aplicativo.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION' && event.ports?.[0]) {
    event.ports[0].postMessage({ cacheName: CACHE_NAME });
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';
  const isAppFile = /\.(?:css|html|js|json|webmanifest)$/i.test(url.pathname);

  // HTML, JS e CSS usam a rede primeiro. Assim, depois da atualização, o reload
  // recebe os arquivos novos mesmo que o navegador ainda possua cache HTTP antigo.
  if (isNavigation || isAppFile) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(isNavigation ? './index.html' : request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(isNavigation ? './index.html' : request);
          return cached || Response.error();
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        }),
    ),
  );
});
