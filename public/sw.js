const CACHE = 'eodigaji-offline-v1';
// Only the public offline document is cached. Auth, profiles, courses and API requests remain network-only.
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html'))); });
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('eodigaji-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (event.request.method !== 'GET' || url.origin !== self.location.origin || event.request.mode !== 'navigate' || url.pathname.startsWith('/api/')) return;
 event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
