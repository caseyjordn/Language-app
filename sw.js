// Service worker for offline/installable support.
//
// Strategy:
// - index.html (the actual code): network-first, falling back to cache when
//   offline. This means whenever you're online, you always get the latest
//   version I've pushed — the cache is just a safety net for offline use,
//   not something that can serve you stale code indefinitely.
// - Audio files, manifest.json, icons: cache-first. These are immutable
//   once generated (a given word's audio file never changes), so there's
//   no reason to hit the network for them once cached — this is what
//   makes the app actually work with no connection on your phone.
//
// Audio files to precache are read from audio/manifest.json at install
// time, not hardcoded here — so this file never needs manual updates when
// you run generate-audio.js for new content. Just bump CACHE_VERSION below
// after a content update so the new audio set gets precached.

const CACHE_VERSION = 'v1';
const CACHE_NAME = 'jp-practice-' + CACHE_VERSION;

const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-apple-touch.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    try {
      const manifestRes = await fetch('audio/manifest.json');
      const manifest = await manifestRes.json();
      const audioUrls = new Set();
      Object.values(manifest).forEach(entry => {
        if (entry.female) audioUrls.add('audio/' + entry.female);
        if (entry.male) audioUrls.add('audio/' + entry.male);
      });
      await cache.add('audio/manifest.json');
      // cache in batches so one failed file doesn't abort the whole precache
      const urls = [...audioUrls];
      for (let i = 0; i < urls.length; i += 25) {
        await Promise.allSettled(urls.slice(i, i + 25).map(u => cache.add(u)));
      }
    } catch (err) {
      console.warn('Audio precache skipped (offline during install?):', err);
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isCore = url.pathname.endsWith('/index.html') || url.pathname === '/' || url.pathname.endsWith('/');
  const isAudio = url.pathname.includes('/audio/');

  if (isAudio) {
    // cache-first: immutable content, no need to ever re-fetch once cached
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const res = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, res.clone());
      return res;
    })());
    return;
  }

  if (isCore) {
    // network-first: always get the latest code when online, cache is
    // only the offline fallback
    event.respondWith((async () => {
      try {
        const res = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, res.clone());
        return res;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })());
  }
});
