// Service Worker for Premium Karaoke TV PWA
const CACHE_NAME = 'karaoke-tv-v2';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((k) => {
                    if (k !== CACHE_NAME) return caches.delete(k);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // Only handle GET requests
    if (e.request.method !== 'GET') return;

    const url = e.request.url;
    // Let browser directly fetch APIs, PHP scripts, and external YouTube requests
    if (url.includes('/api/') || url.includes('.php') || url.includes('youtube.com') || url.includes('ytimg.com')) {
        return;
    }

    e.respondWith(
        fetch(e.request).catch(async () => {
            const cached = await caches.match(e.request);
            if (cached) return cached;
            return new Response('Network error', {
                status: 408,
                headers: { 'Content-Type': 'text/plain' }
            });
        })
    );
});
