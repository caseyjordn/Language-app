// Service worker for offline/installable support.
//
// Strategy:
// - index.html (the actual code) AND audio/manifest.json: network-first,
//   falling back to cache when offline. manifest.json is NOT immutable —
//   it grows every time new vocab gets audio generated for it — so
//   treating it as cache-first (which it was until this bug fix) meant
//   the very first time it got cached, it was cached FOREVER: a phone
//   that had the app installed before a new custom word's audio was
//   generated would never learn that word now has a real file, even
//   though the file and an up-to-date manifest both genuinely exist on
//   the server. New custom vocab would silently keep falling back to
//   robotic browser TTS indefinitely. This is why it's split out from
//   the actual audio files below now.
// - Audio .wav files, icons: cache-first. These ARE genuinely immutable
//   once generated (a given word's audio file never changes — a fix
//   means a NEW filename, not new bytes under the old one), so there's
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
  const isManifest = url.pathname.endsWith('/audio/manifest.json');
  const isCore = isManifest || url.pathname.endsWith('/index.html') || url.pathname === '/' || url.pathname.endsWith('/');
  const isAudio = url.pathname.includes('/audio/') && !isManifest;

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
