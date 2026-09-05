// Bump this version string whenever you deploy an update!
const CACHE_NAME = 'elden-earth-v1.2.1';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './manifest.json',
    './models/CesiumMan.glb',
    './models/Fox.glb',
    './models/Soldier.glb',
    './models/Xbot.glb',
    './js/main.js',
    './js/foliage.js',
    './js/loading.js',
    './js/leaderboard.js',
    './js/wheel.js',
    './js/diamonds.js',
    './js/auth.js',
    './js/storage.js',
    './js/grid.js',
    './js/geo.js',
    './js/feed.js',
    './js/config.js',
    './js/character.js'
];

// 1. Force Immediate Installation
self.addEventListener('install', (e) => {
    self.skipWaiting(); // Bypass waiting phase immediately
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. Instant Cache Purge & Take Immediate Control
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((oldCache) => {
                    if (oldCache !== CACHE_NAME) {
                        console.log(`[SW] Deleting stale cache: ${oldCache}`);
                        return caches.delete(oldCache);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim(); // Take control of all active tabs immediately
        })
    );
});

// 3. Network-First Strategy (Always fetch fresh code first, cache fallback if offline)
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    // Ignore third-party tiles/APIs (handled by browser)
    if (!e.request.url.startsWith(self.location.origin)) return;

    e.respondWith(
        fetch(e.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // If offline or network fails, load from local cache
                return caches.match(e.request);
            })
    );
});
