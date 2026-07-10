// docs/service-worker.js
const CACHE_NAME = 'controle-financeiro-v47';
// Migração única: clientes anteriores não conhecem o fluxo de confirmação por mensagem.
const AUTO_ACTIVATE_MIGRATION_CACHE = 'controle-financeiro-v46';

const urlsToCache = ['./', './index.html', './style.css', './app.js', './firebase-api.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => {
        if (CACHE_NAME === AUTO_ACTIVATE_MIGRATION_CACHE) return self.skipWaiting();
      }),
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
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
